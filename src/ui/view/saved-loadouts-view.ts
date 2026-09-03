import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// Types
// ===========================================

/** What the saved list reports back to its owner. */
export interface SavedLoadoutsViewHandlers {
  /** The player pressed Load on a template; the owner replaces the draft with it. */
  readonly onLoad: (loadout: MechLoadout) => void;
  /** The player pressed Delete on a template. */
  readonly onDelete: (name: string) => void;
}

// ===========================================
// SavedLoadoutsView
// ===========================================

/**
 * The mech bay's list of saved templates (GDD §5.8), one row per name
 * with Load and Delete. Rebuilt on every `update`; the list is short.
 *
 * ```
 *   ┌ Saved loadouts ───────────────────┐
 *   │ Skirmisher      [Load] [Delete]   │
 *   │ Brawler         [Load] [Delete]   │
 *   └───────────────────────────────────┘
 * ```
 */
export class SavedLoadoutsView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: SavedLoadoutsViewHandlers;
  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callbacks for Load and Delete. */
  constructor(handlers: SavedLoadoutsViewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the panel under `parent`; call `update` to fill it. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const panel = doc.createElement("section");
    panel.id = "saved-loadouts";
    panel.className = "tut-panel tut-mech-bay__saved";
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Saved loadouts";
    const list = doc.createElement("ul");
    list.className = "tut-list";
    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-saved";
    empty.textContent = "No saved loadouts. Save the draft to keep it.";
    panel.append(title, list, empty);
    parent.appendChild(panel);
    this.root = panel;
    this.list = list;
    this.empty = empty;
  }

  /** Rebuilds the rows from `loadouts`. */
  update(loadouts: readonly MechLoadout[]): void {
    if (!this.list || !this.empty) {
      return;
    }
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(
      ...loadouts.map((loadout) => this.createRow(doc, loadout)),
    );
    this.empty.hidden = loadouts.length > 0;
  }

  /** Removes the panel and every listener. */
  unmount(): void {
    for (const dispose of this.disposers.splice(0)) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.empty = undefined;
  }

  // ===========================================
  // Rows
  // ===========================================

  /** One template row with its two buttons. */
  private createRow(doc: Document, loadout: MechLoadout): HTMLElement {
    const row = doc.createElement("li");
    row.className = "tut-row";
    row.dataset.loadoutName = loadout.name;
    const name = doc.createElement("span");
    name.className = "tut-data";
    name.dataset.field = "name";
    name.textContent = loadout.name;
    const load = this.button(doc, "load", "Load", () => {
      this.handlers.onLoad(loadout);
    });
    const remove = this.button(doc, "delete", "Delete", () => {
      this.handlers.onDelete(loadout.name);
    });
    row.append(name, load, remove);
    return row;
  }

  /** A themed button with its `data-action` and click handler. */
  private button(
    doc: Document,
    action: string,
    label: string,
    handler: () => void,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "tut-btn";
    button.dataset.action = action;
    button.textContent = label;
    button.addEventListener("click", handler);
    this.disposers.push(() => {
      button.removeEventListener("click", handler);
    });
    return button;
  }
}
