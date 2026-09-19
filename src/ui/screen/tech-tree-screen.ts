import type { Unsubscribe } from "../../core/model/event-bus";
import { grantTechPoints } from "../../overworld/model/grant-tech-points-command";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechDevTools } from "../../tech/model/tech-dev-tools";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import {
  missingPrerequisites,
  techNodeStatus,
} from "../../tech/service/tech-status-service";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import type { TechGraphFrame, TechGraphHost } from "../model/tech-graph-host";
import type { TechGraphLayout } from "../model/tech-graph-layout";
import { formatTechPoints, formatWhole } from "../service/format";
import { layoutTechGraph } from "../service/tech-graph-layout";

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
};

/** Badge tone per status, from the theme's badge modifiers. */
const STATUS_TONES: Readonly<Record<TechNodeStatus, string>> = {
  unlocked: "ok",
  available: "info",
  unaffordable: "warn",
  locked: "",
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
 * Labels are built once in `mount` and only their status and position
 * change afterwards.
 */
export class TechTreeScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "tech-tree";
  private readonly deps: TechTreeScreenDeps;
  private readonly layout: TechGraphLayout;
  private root: HTMLElement | undefined;
  private balance: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private detail: DetailPanel | undefined;
  private labels = new Map<TechNodeId, NodeLabel>();
  private familyLabels = new Map<string, HTMLElement>();
  private selected: TechNodeId | undefined;
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session, catalogues, the graph host and the dev tools. */
  constructor(deps: TechTreeScreenDeps) {
    this.deps = deps;
    this.layout = layoutTechGraph(deps.tech);
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the bar, the stage with its labels and the detail panel, attaches the graph and subscribes to the store. */
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

    this.deps.graph?.attach(stage, this.layout, {
      framed: (frame) => {
        this.place(frame);
      },
      picked: (nodeId) => {
        this.select(nodeId);
      },
    });

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
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
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

  /** Rewrites the balance, every label's status, the graph's tints and the detail panel from `state`. */
  private render(state: GameState | undefined): void {
    if (this.balance) {
      this.balance.textContent = state
        ? formatTechPoints(state.economy.techPoints)
        : "—";
    }
    const statuses = new Map<TechNodeId, TechNodeStatus>();
    for (const label of this.labels.values()) {
      const status = state
        ? techNodeStatus(label.node, state.tech, state.economy)
        : "locked";
      statuses.set(label.node.id, status);
      label.root.dataset.status = status;
      this.setBadge(label.badge, status);
    }
    this.deps.graph?.setStatuses(statuses);
    this.renderDetail(state);
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
    detail.name.textContent = node.name;
    detail.cost.textContent = formatTechPoints(node.cost);
    detail.description.textContent = node.description;
    detail.unlocks.replaceChildren(
      ...node.unlocks.map((partId) => {
        const item = detail.unlocks.ownerDocument.createElement("li");
        item.dataset.partId = partId;
        item.textContent = this.deps.parts.getPart(partId)?.name ?? partId;
        return item;
      }),
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
    const status = techNodeStatus(node, state.tech, state.economy);
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

  /** Selects `nodeId` (or clears): the pedestal lights, the label and the detail follow. */
  private select(nodeId: TechNodeId | undefined): void {
    this.selected = nodeId;
    for (const label of this.labels.values()) {
      label.root.dataset.selected = String(label.node.id === nodeId);
    }
    this.deps.graph?.setSelected(nodeId);
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

  /** The stage: the graph's container with the label layer and the controls hint over it. */
  private createStage(doc: Document): HTMLElement {
    const stage = doc.createElement("div");
    stage.className = "tut-tech-tree__stage";
    stage.dataset.role = "tech-graph";
    const labels = doc.createElement("div");
    labels.className = "tut-tech-tree__labels";
    labels.dataset.role = "tech-labels";
    for (const family of this.layout.families) {
      const label = doc.createElement("div");
      label.className = "tut-label tut-tech-tree__family";
      label.dataset.family = family.id;
      label.textContent = family.name;
      labels.appendChild(label);
      this.familyLabels.set(family.id, label);
    }
    for (const placement of this.layout.nodes) {
      const node = this.deps.tech.getNode(placement.id);
      if (node) {
        labels.appendChild(this.createLabel(doc, node));
      }
    }
    const hint = doc.createElement("div");
    hint.className = "tut-dim tut-tech-tree__hint";
    hint.dataset.role = "controls-hint";
    hint.textContent = CONTROLS_HINT;
    stage.append(labels, hint);
    return stage;
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
    this.listen(label, () => {
      this.select(node.id);
    });
    this.labels.set(node.id, { node, root: label, badge });
    return label;
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

  /** Attaches a click handler and remembers how to remove it. */
  private listen(target: HTMLElement, handler: () => void): void {
    target.addEventListener("click", handler);
    this.disposers.push(() => {
      target.removeEventListener("click", handler);
    });
  }
}
