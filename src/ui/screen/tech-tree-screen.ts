import type { Unsubscribe } from "../../core/model/event-bus";
import { grantTechPoints } from "../../overworld/model/grant-tech-points-command";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { NO_TECH_CONDITIONS } from "../../tech/model/tech-conditions";
import type { TechDevTools } from "../../tech/model/tech-dev-tools";
import type { TechEffect } from "../../tech/model/tech-effect";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import {
  isTechNodeHidden,
  missingPrerequisites,
  techNodeStatus,
} from "../../tech/service/tech-status-service";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TechGraphFrame, TechGraphHost } from "../model/tech-graph-host";
import type { TechEffectLabels } from "../model/tech-effect-labels";
import type { TechGraphLayout } from "../model/tech-graph-layout";
import { formatTechPoints, formatWhole } from "../service/format";
import { describeTechEffect } from "../service/tech-effect-describer";
import { layoutTechGraph } from "../service/tech-graph-layout";
import type { TechNodeKindSources } from "../service/tech-node-kind-text";
import { techNodeKindText } from "../service/tech-node-kind-text";

// ===========================================
// Types
// ===========================================

/** What the tech tree screen needs from the app. */
export interface TechTreeScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** The tree the graph and the detail panel are drawn from. */
  readonly tech: TechCatalogue;
  /** Names the parts a node unlocks. */
  readonly parts: PartCatalogue;
  /**
   * The campaign's conditions, which decide which nodes are hidden (ADR
   * 0013 §2.7). Must be the function the unlock handler was wired with
   * (`GameComposition.techConditionsOf`), so a card never shows a node
   * the command refuses. With no campaign the screen assumes no flags.
   */
  readonly conditionsOf: (state: GameState) => TechConditions;
  /** Names the squad type a squad-type effect opens; absent, its id's words are shown. */
  readonly squadTypes?: SquadTypeCatalogue;
  /** Names flag and infantry upgrade effects; absent, their ids' words are shown. */
  readonly effectLabels?: TechEffectLabels;
  /**
   * Names the species an autopsy studies, for the "Autopsy: Spitter"
   * line (campaign arc §10.2); absent, the species id's words are shown.
   */
  readonly speciesOf?: TechNodeKindSources["speciesOf"];
  /**
   * Draws the graph in three (#1171); absent in unit tests that only
   * check the DOM, and then the labels are built but never placed.
   */
  readonly graph?: TechGraphHost;
  /**
   * The dev build's Free TP button; absent — every production build,
   * and every test that does not ask — the button is not built at all.
   */
  readonly devTools?: TechDevTools;
}

/** The live pieces of one node label that `render` rewrites. */
interface NodeLabel {
  readonly node: TechNode;
  readonly root: HTMLElement;
  readonly badge: HTMLElement;
}

/** The detail panel's live pieces. */
interface DetailPanel {
  readonly root: HTMLElement;
  readonly empty: HTMLElement;
  readonly body: HTMLElement;
  readonly family: HTMLElement;
  readonly kind: HTMLElement;
  readonly name: HTMLElement;
  readonly cost: HTMLElement;
  readonly badge: HTMLElement;
  readonly description: HTMLElement;
  readonly unlocks: HTMLElement;
  readonly reason: HTMLElement;
  readonly button: HTMLButtonElement;
}

// ===========================================
// Constants
// ===========================================

/** Badge copy per status; the button carries the verb, this the state. */
const STATUS_LABELS: Readonly<Record<TechNodeStatus, string>> = {
  unlocked: "Unlocked",
  available: "Available",
  unaffordable: "Unaffordable",
  locked: "Locked",
  hidden: "Undiscovered",
};

/** Badge tone per status, from the theme's badge modifiers. */
const STATUS_TONES: Readonly<Record<TechNodeStatus, string>> = {
  unlocked: "ok",
  available: "info",
  unaffordable: "warn",
  locked: "",
  hidden: "",
};

/** What the stage says under the graph. */
const CONTROLS_HINT = "W A S D pan · Q E rotate · wheel zoom · click a part";

/**
 * Labels shrink with the graph as the camera pulls back, down to this
 * fraction at `LABEL_FULL_ZOOM * LABEL_MIN_SCALE` pixels per unit, so a
 * zoomed-out web is still readable rather than a pile of overlapping
 * cards.
 */
const LABEL_FULL_ZOOM = 64;
const LABEL_MIN_SCALE = 0.7;

// ===========================================
// TechTreeScreen
// ===========================================

/**
 * The tech tree (GDD §5.5.1, #1171) as a web: the graph host draws the
 * core, a plinth per family and a pedestal per node with the part's
 * model turning on it, under the same camera controls as the tactical
 * map. The screen floats a label on every pedestal and plinth, keeps
 * them under the models as the camera moves, and shows the selected
 * node in the detail panel, where Unlock lives.
 *
 * ```
 *   ┌ #tech-tree-bar  TECH TREE  42 TP ── status ── [Free TP] [Mech bay] [Overworld] ┐
 *   ├───────────────────────────────────────────────┬──────────────────────────────┤
 *   │  stage (canvas)                               │ #tech-tree-detail            │
 *   │        ·Sprint Frame                          │  MOBILITY                    │
 *   │    ·Jump Jets   ·All-Terrain                  │  Jump Jets          18 TP    │
 *   │            ▲ Mobility                         │  [Available]                 │
 *   │    ·  ·        ◆ core        ·  ·             │  Boost-assisted legs …       │
 *   │       ▲                    ▲                  │  Unlocks: Jumper Legs        │
 *   │  W A S D pan · Q E rotate · wheel zoom        │  [Unlock]                    │
 *   └───────────────────────────────────────────────┴──────────────────────────────┘
 *
 *   host.picked(id) / label click ──► select(id) ──► host.setSelected · detail render
 *   [Unlock] ──► store.dispatch(unlockTech(id)) ──► store change ──► render(state)
 *   host.framed(frame) ──► every label's transform
 * ```
 *
 * Only the nodes the campaign has discovered are drawn (ADR 0013
 * §2.7). The graph is laid out on the first render and again whenever
 * the set of hidden nodes changes, which happens while the screen is up
 * when an unlock sets a flag another node needs; then the labels are
 * rebuilt and the graph re-attached with the new layout. Otherwise the
 * labels are built once and only their status and position change.
 *
 * ```
 *   render(state) ──► conditionsOf(state) ──► hidden set changed? ──► layout, labels, host.attach
 *                                                                └──► statuses, detail
 * ```
 */
export class TechTreeScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "tech-tree";
  private readonly deps: TechTreeScreenDeps;
  /** The layout drawn now; undefined until the first render lays one out. */
  private layout: TechGraphLayout | undefined;
  /** The hidden node ids `layout` was built for, joined. */
  private hiddenKey: string | undefined;
  private root: HTMLElement | undefined;
  private stage: HTMLElement | undefined;
  private labelLayer: HTMLElement | undefined;
  private balance: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private detail: DetailPanel | undefined;
  private labels = new Map<TechNodeId, NodeLabel>();
  private familyLabels = new Map<string, HTMLElement>();
  private selected: TechNodeId | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];
  /** The label listeners, released whenever the labels are rebuilt. */
  private labelDisposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, catalogues, the conditions, the graph host and the dev tools. */
  constructor(deps: TechTreeScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the bar, the stage and the detail panel, lays the graph out and attaches it on the first render, and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-tech-tree";
    layout.dataset.screen = this.id;
    layout.appendChild(this.createBar(doc));

    const body = doc.createElement("div");
    body.className = "tut-tech-tree__body";
    const stage = this.createStage(doc);
    body.append(stage, this.createDetail(doc));
    layout.appendChild(body);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Releases the graph, unsubscribes and removes the layout and every listener. */
  unmount(): void {
    this.deps.graph?.release();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of [
      ...this.disposers.splice(0),
      ...this.labelDisposers.splice(0),
    ]) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.stage = undefined;
    this.labelLayer = undefined;
    this.layout = undefined;
    this.hiddenKey = undefined;
    this.balance = undefined;
    this.status = undefined;
    this.detail = undefined;
    this.labels = new Map();
    this.familyLabels = new Map();
    this.selected = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /**
   * Re-lays the graph out if the hidden set changed, then rewrites the
   * balance, every label's status, the graph's tints and the detail
   * panel from `state`.
   */
  private render(state: GameState | undefined): void {
    const conditions = this.conditionsFor(state);
    this.relayout(conditions);
    if (this.balance) {
      this.balance.textContent = state
        ? formatTechPoints(state.economy.techPoints)
        : "—";
    }
    const statuses = new Map<TechNodeId, TechNodeStatus>();
    for (const label of this.labels.values()) {
      const status = state
        ? techNodeStatus(label.node, state.tech, state.economy, conditions)
        : "locked";
      statuses.set(label.node.id, status);
      label.root.dataset.status = status;
      this.setBadge(label.badge, status);
    }
    this.deps.graph?.setStatuses(statuses);
    this.renderDetail(state);
  }

  /**
   * Lays the graph out for `conditions` when there is no layout yet or
   * the set of hidden nodes differs from the one it was built for: the
   * labels are rebuilt, a selection that is no longer drawn is dropped,
   * and the host is re-attached with the new layout (which rebuilds its
   * scene and reframes the camera). A render that changes no node's
   * visibility does nothing here.
   */
  private relayout(conditions: TechConditions): void {
    const stage = this.stage;
    if (!stage) {
      return;
    }
    const hiddenKey = this.deps.tech
      .listNodes()
      .filter((node) => isTechNodeHidden(node, conditions))
      .map((node) => node.id)
      .join("|");
    if (this.layout !== undefined && hiddenKey === this.hiddenKey) {
      return;
    }
    const layout = layoutTechGraph(this.deps.tech, conditions);
    this.layout = layout;
    this.hiddenKey = hiddenKey;
    this.buildLabels(stage.ownerDocument, layout);
    if (this.selected !== undefined && !this.labels.has(this.selected)) {
      this.selected = undefined;
    }
    this.deps.graph?.attach(stage, layout, {
      framed: (frame) => {
        this.place(frame);
      },
      picked: (nodeId) => {
        this.select(nodeId);
      },
    });
    if (this.selected !== undefined) {
      const label = this.labels.get(this.selected);
      if (label) {
        label.root.dataset.selected = "true";
      }
      this.deps.graph?.setSelected(this.selected);
    }
  }

  /** The conditions of `state`, or none without a campaign. */
  private conditionsFor(state: GameState | undefined): TechConditions {
    return state ? this.deps.conditionsOf(state) : NO_TECH_CONDITIONS;
  }

  /** The detail panel: empty until a node is selected, then that node against `state`. */
  private renderDetail(state: GameState | undefined): void {
    const detail = this.detail;
    if (!detail) {
      return;
    }
    const node =
      this.selected === undefined
        ? undefined
        : this.deps.tech.getNode(this.selected);
    detail.empty.hidden = node !== undefined;
    detail.body.hidden = node === undefined;
    if (!node) {
      delete detail.root.dataset.selectedNode;
      delete detail.root.dataset.status;
      return;
    }
    detail.root.dataset.selectedNode = node.id;
    detail.family.textContent =
      this.deps.tech.listFamilies().find((f) => f.id === node.family)?.name ??
      node.family;
    const kind = techNodeKindText(
      node,
      this.deps.speciesOf ? { speciesOf: this.deps.speciesOf } : {},
    );
    detail.kind.textContent = kind ?? "";
    detail.kind.hidden = kind === undefined;
    detail.name.textContent = node.name;
    detail.cost.textContent = formatTechPoints(node.cost);
    detail.description.textContent = node.description;
    detail.unlocks.replaceChildren(
      ...node.effects.map((effect) =>
        this.createEffectItem(detail.unlocks.ownerDocument, effect),
      ),
    );
    if (!state) {
      detail.root.dataset.status = "locked";
      this.setBadge(detail.badge, "locked");
      detail.reason.textContent = "No active campaign.";
      detail.reason.hidden = false;
      detail.button.disabled = true;
      detail.button.hidden = false;
      return;
    }
    const status = techNodeStatus(
      node,
      state.tech,
      state.economy,
      this.conditionsFor(state),
    );
    detail.root.dataset.status = status;
    this.setBadge(detail.badge, status);
    detail.reason.textContent = this.reasonFor(node, status, state);
    detail.reason.hidden = detail.reason.textContent === "";
    detail.button.hidden = status === "unlocked";
    detail.button.disabled = status !== "available";
  }

  /** The reason line's copy per status. */
  private reasonFor(
    node: TechNode,
    status: TechNodeStatus,
    state: GameState,
  ): string {
    switch (status) {
      case "unaffordable": {
        const short = node.cost - state.economy.techPoints;
        return `Need ${formatWhole(short)} more TP`;
      }
      case "locked": {
        const names = missingPrerequisites(node, state.tech).map(
          (id) => this.deps.tech.getNode(id)?.name ?? id,
        );
        return `Requires ${names.join(", ")}`;
      }
      case "hidden":
        return "Not yet discovered.";
      case "unlocked":
      case "available":
        return "";
    }
  }

  /** Writes a status badge's text and tone. */
  private setBadge(badge: HTMLElement, status: TechNodeStatus): void {
    const tone = STATUS_TONES[status];
    badge.className =
      tone === "" ? "tut-badge" : `tut-badge tut-badge--${tone}`;
    badge.textContent = STATUS_LABELS[status];
  }

  /** Moves every label onto its pedestal or plinth for this frame, scaled with the zoom. */
  private place(frame: TechGraphFrame): void {
    const scale = Math.min(
      1,
      Math.max(LABEL_MIN_SCALE, frame.zoom / LABEL_FULL_ZOOM),
    );
    const transform = (x: number, y: number): string =>
      `translate(-50%, 0) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    for (const anchor of frame.nodes) {
      const label = this.labels.get(anchor.id);
      if (label) {
        label.root.style.transform = transform(anchor.x, anchor.y);
      }
    }
    for (const anchor of frame.families) {
      const label = this.familyLabels.get(anchor.id);
      if (label) {
        label.style.transform = transform(anchor.x, anchor.y);
      }
    }
  }

  // ===========================================
  // Actions
  // ===========================================

  /**
   * Selects `nodeId` (or clears): the pedestal lights, the label and the
   * detail follow. A node that is not drawn — hidden, or unknown —
   * clears the selection rather than showing what the web does not.
   */
  private select(nodeId: TechNodeId | undefined): void {
    const drawn =
      nodeId !== undefined && this.labels.has(nodeId) ? nodeId : undefined;
    this.selected = drawn;
    for (const label of this.labels.values()) {
      label.root.dataset.selected = String(label.node.id === drawn);
    }
    this.deps.graph?.setSelected(drawn);
    this.renderDetail(this.deps.session.store?.getState());
  }

  /** Buys `node`; the store's change notification re-renders on success. */
  private unlock(node: TechNode): void {
    this.dispatch(unlockTech(node.id));
  }

  /** The dev build's free points; the store's change notification re-renders on success. */
  private grant(): void {
    if (this.deps.devTools) {
      this.dispatch(grantTechPoints(this.deps.devTools.grantPoints));
    }
  }

  /** Runs a command through the store; a rejection lands in the status line. Returns success. */
  private dispatch(command: OverworldCommand): boolean {
    const store = this.deps.session.store;
    if (!store) {
      this.showStatus("No active campaign.");
      return false;
    }
    const result = store.dispatch(command);
    this.showStatus(result.ok ? "" : result.error.message);
    return result.ok;
  }

  /** Shows a one-line message in the bar, or hides the line when empty. */
  private showStatus(message: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    this.status.hidden = message === "";
  }

  // ===========================================
  // DOM
  // ===========================================

  /** The header: title, balance, status, the dev tools and the ways out. */
  private createBar(doc: Document): HTMLElement {
    const bar = doc.createElement("header");
    bar.id = "tech-tree-bar";
    bar.className = "tut-topbar tut-tech-tree__bar";
    const title = doc.createElement("span");
    title.className = "tut-label";
    title.textContent = "Tech tree";
    const balance = doc.createElement("span");
    balance.className = "tut-data";
    balance.dataset.field = "techPoints";
    balance.textContent = "—";
    const spacer = doc.createElement("span");
    spacer.className = "tut-topbar__spacer";
    const status = doc.createElement("span");
    status.className = "tut-topbar__status tut-dim";
    status.dataset.role = "status";
    status.hidden = true;
    bar.append(title, balance, spacer, status);
    if (this.deps.devTools) {
      const free = this.createButton(
        doc,
        "free-tech-points",
        `Free TP (+${formatWhole(this.deps.devTools.grantPoints)})`,
        false,
      );
      free.title = "Development build only: grants tech points for testing.";
      this.listen(free, () => {
        this.grant();
      });
      bar.appendChild(free);
    }
    const mechBay = this.createButton(doc, "mech-bay", "Mech bay", false);
    this.listen(mechBay, () => {
      this.deps.router.navigate("mech-bay");
    });
    const overworld = this.createButton(doc, "overworld", "Overworld", false);
    this.listen(overworld, () => {
      this.deps.router.navigate("overworld");
    });
    bar.append(mechBay, overworld);
    this.balance = balance;
    this.status = status;
    return bar;
  }

  /** The stage: the graph's container with the (empty) label layer and the controls hint over it. */
  private createStage(doc: Document): HTMLElement {
    const stage = doc.createElement("div");
    stage.className = "tut-tech-tree__stage";
    stage.dataset.role = "tech-graph";
    const labels = doc.createElement("div");
    labels.className = "tut-tech-tree__labels";
    labels.dataset.role = "tech-labels";
    const hint = doc.createElement("div");
    hint.className = "tut-dim tut-tech-tree__hint";
    hint.dataset.role = "controls-hint";
    hint.textContent = CONTROLS_HINT;
    stage.append(labels, hint);
    this.stage = stage;
    this.labelLayer = labels;
    return stage;
  }

  /**
   * Fills the label layer from `layout`, replacing any labels already
   * there: one per family plinth in draw order, then one per placed
   * node. A hidden node is not placed, so it gets no label.
   */
  private buildLabels(doc: Document, layout: TechGraphLayout): void {
    const layer = this.labelLayer;
    if (!layer) {
      return;
    }
    for (const dispose of this.labelDisposers.splice(0)) {
      dispose();
    }
    this.labels = new Map();
    this.familyLabels = new Map();
    const labels: HTMLElement[] = [];
    for (const family of layout.families) {
      const label = doc.createElement("div");
      label.className = "tut-label tut-tech-tree__family";
      label.dataset.family = family.id;
      label.textContent = family.name;
      labels.push(label);
      this.familyLabels.set(family.id, label);
    }
    for (const placement of layout.nodes) {
      const node = this.deps.tech.getNode(placement.id);
      if (node) {
        labels.push(this.createLabel(doc, node));
      }
    }
    layer.replaceChildren(...labels);
  }

  /** One node's floating label: name, cost and status; a click selects it. */
  private createLabel(doc: Document, node: TechNode): HTMLElement {
    const label = doc.createElement("button");
    label.type = "button";
    label.className = "tut-tech-tree__node";
    label.dataset.node = node.id;
    label.dataset.status = "locked";
    label.dataset.selected = "false";
    const name = doc.createElement("span");
    name.className = "tut-tech-tree__node-name";
    name.dataset.field = "name";
    name.textContent = node.name;
    const line = doc.createElement("span");
    line.className = "tut-tech-tree__node-line";
    const cost = doc.createElement("span");
    cost.className = "tut-data";
    cost.dataset.field = "cost";
    cost.textContent = formatTechPoints(node.cost);
    const badge = doc.createElement("span");
    badge.className = "tut-badge";
    badge.dataset.role = "status";
    line.append(cost, badge);
    label.append(name, line);
    this.listen(
      label,
      () => {
        this.select(node.id);
      },
      this.labelDisposers,
    );
    this.labels.set(node.id, { node, root: label, badge });
    return label;
  }

  /**
   * One line of the detail panel's "Unlocks" list: the effect in words,
   * tagged with its kind and id so a spec can find it.
   */
  private createEffectItem(doc: Document, effect: TechEffect): HTMLElement {
    const item = doc.createElement("li");
    item.dataset.effectKind = effect.kind;
    switch (effect.kind) {
      case "part":
        item.dataset.partId = effect.partId;
        break;
      case "flag":
        item.dataset.flag = effect.flag;
        break;
      case "squad-type":
        item.dataset.squadTypeId = effect.squadTypeId;
        break;
      case "infantry-upgrade":
        item.dataset.upgradeId = effect.upgradeId;
        break;
    }
    item.textContent = describeTechEffect(effect, {
      parts: this.deps.parts,
      ...(this.deps.squadTypes ? { squadTypes: this.deps.squadTypes } : {}),
      ...(this.deps.effectLabels ? { labels: this.deps.effectLabels } : {}),
    });
    return item;
  }

  /** The detail panel: what the selected node is, unlocks and costs, and Unlock. */
  private createDetail(doc: Document): HTMLElement {
    const panel = doc.createElement("aside");
    panel.id = "tech-tree-detail";
    panel.className = "tut-panel tut-tech-tree__detail";
    panel.dataset.role = "tech-detail";
    const empty = doc.createElement("p");
    empty.className = "tut-dim tut-tech-tree__empty";
    empty.dataset.role = "empty";
    empty.textContent =
      "Select a part on the web to see what it costs and what it unlocks.";
    const body = doc.createElement("div");
    body.className = "tut-tech-tree__detail-body";
    body.hidden = true;
    const family = doc.createElement("div");
    family.className = "tut-label";
    family.dataset.field = "family";
    const kind = doc.createElement("p");
    kind.className = "tut-tech-tree__kind";
    kind.dataset.field = "kind";
    kind.hidden = true;
    const head = doc.createElement("div");
    head.className = "tut-tech-tree__detail-head";
    const name = doc.createElement("span");
    name.className = "tut-tech-tree__detail-name";
    name.dataset.field = "name";
    const cost = doc.createElement("span");
    cost.className = "tut-data";
    cost.dataset.field = "cost";
    head.append(name, cost);
    const badge = doc.createElement("span");
    badge.className = "tut-badge";
    badge.dataset.role = "status";
    const description = doc.createElement("p");
    description.className = "tut-tech-tree__detail-note";
    description.dataset.field = "description";
    const unlocksTitle = doc.createElement("div");
    unlocksTitle.className = "tut-label";
    unlocksTitle.textContent = "Unlocks";
    const unlocks = doc.createElement("ul");
    unlocks.className = "tut-tech-tree__unlocks";
    unlocks.dataset.field = "unlocks";
    const reason = doc.createElement("p");
    reason.className = "tut-dim tut-tech-tree__reason";
    reason.dataset.field = "reason";
    reason.hidden = true;
    const button = this.createButton(doc, "unlock", "Unlock", true);
    button.disabled = true;
    this.listen(button, () => {
      const node =
        this.selected === undefined
          ? undefined
          : this.deps.tech.getNode(this.selected);
      if (node) {
        this.unlock(node);
      }
    });
    body.append(
      family,
      kind,
      head,
      badge,
      description,
      unlocksTitle,
      unlocks,
      reason,
      button,
    );
    panel.append(empty, body);
    this.detail = {
      root: panel,
      empty,
      body,
      family,
      kind,
      name,
      cost,
      badge,
      description,
      unlocks,
      reason,
      button,
    };
    return panel;
  }

  /** A themed button carrying its `data-action`. */
  private createButton(
    doc: Document,
    action: string,
    label: string,
    primary: boolean,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = primary ? "tut-btn tut-btn--primary" : "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  /**
   * Attaches a click handler and remembers how to remove it, in
   * `disposers` — the screen's own list unless the caller keeps a
   * shorter-lived one, as the labels do.
   */
  private listen(
    target: HTMLElement,
    handler: () => void,
    disposers: (() => void)[] = this.disposers,
  ): void {
    target.addEventListener("click", handler);
    disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }
}
