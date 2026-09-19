import type { Unsubscribe } from "../../core/model/event-bus";
import type { OverworldCommand } from "../../overworld/model/overworld-command";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import type { TechNodeStatus } from "../../tech/service/tech-status-service";
import {
  missingPrerequisites,
  techNodeStatus,
} from "../../tech/service/tech-status-service";
import type { GameSession } from "../model/game-session";
import type { Screen, ScreenId } from "../model/screen";
import type { ScreenRouter } from "../model/screen-router";
import { formatTechPoints, formatWhole } from "../service/format";

// ===========================================
// Types
// ===========================================

/** What the tech tree screen needs from the app. */
export interface TechTreeScreenDeps {
  readonly router: ScreenRouter;
  readonly session: GameSession;
  /** The tree the columns and cards are drawn from. */
  readonly tech: TechCatalogue;
  /** Names the parts a node unlocks. */
  readonly parts: PartCatalogue;
}

/** The live pieces of one node card that `render` rewrites. */
interface NodeCard {
  readonly node: TechNode;
  readonly root: HTMLElement;
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

// ===========================================
// TechTreeScreen
// ===========================================

/**
 * The tech tree (GDD §5.5.1, #1171): one column per research family,
 * tier 2 cards above tier 3 cards, every card naming its cost, the
 * parts it makes purchasable and where it stands against the campaign.
 * Unlock dispatches `UnlockTech` through the campaign store; a
 * rejection lands in the header's status line, a success re-renders
 * every card from the store's next state.
 *
 * ```
 *   ┌ #tech-tree-bar  TECH TREE  42 TP ── status ── [Mech bay] [Overworld] ┐
 *   ├──────────────┬──────────────┬──────────────┬───┄                      │
 *   │ MOBILITY     │ PROTECTION   │ BALLISTICS   │                          │
 *   │ ┌ Jump Jets ┐│ ┌ Composite ┐│ ┌ Heavy AC  ┐│  tier 2                  │
 *   │ │ 18 TP     ││ │ 18 TP     ││ │ 18 TP     ││                          │
 *   │ │ [Unlock]  ││ │ Unlocked  ││ │ need 6 more││                         │
 *   │ └───────────┘│ └───────────┘│ └───────────┘│                          │
 *   │      ▼       │      ▼       │      ▼       │                          │
 *   │ ┌ Sprint    ┐│ ┌ Ablative  ┐│ ┌ Siege Rail┐│  tier 3                  │
 *   │ │ Requires  ││ │ [Unlock]  ││ │ Requires  ││                          │
 *   │ └───────────┘│ └───────────┘│ └───────────┘│                          │
 *   └──────────────┴──────────────┴──────────────┴───┄                      ┘
 *
 *   [Unlock] ──► store.dispatch(unlockTech(id)) ──► store change ──► render(state)
 * ```
 *
 * Cards are built once in `mount` and only their status, reason and
 * button change afterwards, so a click never lands on a rebuilt card.
 */
export class TechTreeScreen implements Screen {
  // ===========================================
  // Fields
  // ===========================================

  readonly id: ScreenId = "tech-tree";
  private readonly deps: TechTreeScreenDeps;
  private root: HTMLElement | undefined;
  private balance: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private cards = new Map<TechNodeId, NodeCard>();
  private unsubscribe: Unsubscribe | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param deps - Router, session and the catalogues the cards read. */
  constructor(deps: TechTreeScreenDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Screen
  // ===========================================

  /** Builds the columns and cards, renders the state and subscribes to the store. */
  mount(root: HTMLElement): void {
    const doc = root.ownerDocument;
    const layout = doc.createElement("section");
    layout.className = "tut-tech-tree";
    layout.dataset.screen = this.id;
    layout.appendChild(this.createBar(doc));
    const body = doc.createElement("div");
    body.className = "tut-tech-tree__body";
    body.dataset.role = "tech-families";
    for (const family of this.deps.tech.listFamilies()) {
      body.appendChild(this.createFamily(doc, family.id));
    }
    layout.appendChild(body);
    root.appendChild(layout);
    this.root = layout;

    const store = this.deps.session.store;
    this.render(store?.getState());
    this.unsubscribe = store?.subscribe((change) => {
      this.render(change.state);
    });
  }

  /** Unsubscribes and removes the layout and every listener. */
  unmount(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.balance = undefined;
    this.status = undefined;
    this.cards = new Map();
  }

  // ===========================================
  // Rendering
  // ===========================================

  /** Rewrites the balance and every card's status from `state`. */
  private render(state: GameState | undefined): void {
    if (this.balance) {
      this.balance.textContent = state
        ? formatTechPoints(state.economy.techPoints)
        : "—";
    }
    for (const card of this.cards.values()) {
      this.renderCard(card, state);
    }
  }

  /**
   * One card's status, its reason line and its button. The reason says
   * what stands between the player and the node: the points short, or
   * the prerequisites still locked.
   */
  private renderCard(card: NodeCard, state: GameState | undefined): void {
    const badge = card.root.querySelector<HTMLElement>('[data-role="status"]');
    if (!state) {
      card.root.dataset.status = "locked";
      card.button.disabled = true;
      card.button.hidden = false;
      card.reason.textContent = "No active campaign.";
      this.setBadge(badge, "locked");
      return;
    }
    const status = techNodeStatus(card.node, state.tech, state.economy);
    card.root.dataset.status = status;
    this.setBadge(badge, status);
    card.button.hidden = status === "unlocked";
    card.button.disabled = status !== "available";
    card.reason.textContent = this.reasonFor(card.node, status, state);
    card.reason.hidden = card.reason.textContent === "";
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
  private setBadge(badge: HTMLElement | null, status: TechNodeStatus): void {
    if (!badge) {
      return;
    }
    const tone = STATUS_TONES[status];
    badge.className =
      tone === "" ? "tut-badge" : `tut-badge tut-badge--${tone}`;
    badge.textContent = STATUS_LABELS[status];
  }

  // ===========================================
  // Actions
  // ===========================================

  /** Buys `node`; the store's change notification re-renders on success. */
  private unlock(node: TechNode): void {
    this.dispatch(unlockTech(node.id));
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

  /** The header: title, balance, status and the ways out. */
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
    const mechBay = this.createButton(doc, "mech-bay", "Mech bay", false);
    this.listen(mechBay, () => {
      this.deps.router.navigate("mech-bay");
    });
    const overworld = this.createButton(doc, "overworld", "Overworld", false);
    this.listen(overworld, () => {
      this.deps.router.navigate("overworld");
    });
    bar.append(title, balance, spacer, status, mechBay, overworld);
    this.balance = balance;
    this.status = status;
    return bar;
  }

  /** One family column: heading, description, the tier 2 row, an arrow, the tier 3 row. */
  private createFamily(doc: Document, familyId: string): HTMLElement {
    const family = this.deps.tech
      .listFamilies()
      .find((candidate) => candidate.id === familyId);
    const column = doc.createElement("section");
    column.className = "tut-panel tut-tech-tree__family";
    column.dataset.family = familyId;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = family?.name ?? familyId;
    const description = doc.createElement("p");
    description.className = "tut-dim tut-tech-tree__family-note";
    description.textContent = family?.description ?? "";
    column.append(title, description);
    const nodes = this.deps.tech
      .listNodes()
      .filter((node) => node.family === familyId);
    for (const tier of [2, 3] as const) {
      if (tier === 3) {
        const arrow = doc.createElement("div");
        arrow.className = "tut-tech-tree__arrow tut-dim";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "▼";
        column.appendChild(arrow);
      }
      const row = doc.createElement("div");
      row.className = "tut-tech-tree__tier";
      row.dataset.tier = String(tier);
      const label = doc.createElement("span");
      label.className = "tut-label tut-tech-tree__tier-label";
      label.textContent = `Tier ${String(tier)}`;
      row.appendChild(label);
      for (const node of nodes.filter((candidate) => candidate.tier === tier)) {
        row.appendChild(this.createCard(doc, node));
      }
      column.appendChild(row);
    }
    return column;
  }

  /** One node card: name, cost, description, the parts it unlocks, status and Unlock. */
  private createCard(doc: Document, node: TechNode): HTMLElement {
    const card = doc.createElement("article");
    card.className = "tut-panel tut-panel--raised tut-tech-tree__node";
    card.dataset.node = node.id;
    card.dataset.status = "locked";

    const head = doc.createElement("div");
    head.className = "tut-tech-tree__node-head";
    const name = doc.createElement("span");
    name.className = "tut-tech-tree__node-name";
    name.dataset.field = "name";
    name.textContent = node.name;
    const cost = doc.createElement("span");
    cost.className = "tut-data";
    cost.dataset.field = "cost";
    cost.textContent = formatTechPoints(node.cost);
    head.append(name, cost);

    const description = doc.createElement("p");
    description.className = "tut-tech-tree__node-note";
    description.dataset.field = "description";
    description.textContent = node.description;

    const unlocks = doc.createElement("ul");
    unlocks.className = "tut-tech-tree__unlocks";
    unlocks.dataset.field = "unlocks";
    for (const partId of node.unlocks) {
      const item = doc.createElement("li");
      item.dataset.partId = partId;
      item.textContent = this.deps.parts.getPart(partId)?.name ?? partId;
      unlocks.appendChild(item);
    }

    const foot = doc.createElement("div");
    foot.className = "tut-tech-tree__node-foot";
    const badge = doc.createElement("span");
    badge.className = "tut-badge";
    badge.dataset.role = "status";
    const reason = doc.createElement("span");
    reason.className = "tut-dim tut-tech-tree__reason";
    reason.dataset.field = "reason";
    reason.hidden = true;
    const button = this.createButton(doc, "unlock", "Unlock", true);
    button.disabled = true;
    this.listen(button, () => {
      this.unlock(node);
    });
    foot.append(badge, reason, button);

    card.append(head, description, unlocks, foot);
    this.cards.set(node.id, { node, root: card, reason, button });
    return card;
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
