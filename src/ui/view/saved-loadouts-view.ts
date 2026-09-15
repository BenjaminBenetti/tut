import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// Types
// ===========================================

/** What the loadout popover reports back to its owner. */
export interface SavedLoadoutsViewHandlers {
  /** The player pressed Load on a template; the owner replaces the draft with it. */
  readonly onLoad: (loadout: MechLoadout) => void;
  /** The player pressed Delete on a template. */
  readonly onDelete: (name: string) => void;
  /** The player pressed Save; the owner saves the draft under its name. */
  readonly onSave: () => void;
  /** The player edited the draft's name. */
  readonly onNameChange: (name: string) => void;
}

// ===========================================
// Constants
// ===========================================

/** Most characters a loadout name takes. */
const NAME_MAX_LENGTH = 24;

// ===========================================
// SavedLoadoutsView
// ===========================================

/**
 * The mech bay's saved templates (GDD §5.8), as a popover that opens
 * from a button on the bottom bar (#1145): name the draft and save it,
 * or load and delete what is already saved. The button names the draft
 * so the player always knows what they are editing with the popover
 * shut.
 *
 * ```
 *                 ┌ Saved loadouts ────────────────────────┐
 *                 │ Name [Skirmisher________]  [Save]      │
 *                 │ Skirmisher              [Load] [Delete]│
 *                 │ Brawler                 [Load] [Delete]│
 *                 └────────────────────────────────────────┘
 *   ┌ bottom bar ─────────────────────────────────────────────┐
 *   │ [▴ Loadouts · Skirmisher]                               │
 *   └─────────────────────────────────────────────────────────┘
 * ```
 *
 * Escape, the button, or a click anywhere else closes it. The list is
 * rebuilt on every `update`; it is short.
 */
export class SavedLoadoutsView {
  // ===========================================
  // Fields
  // ===========================================

  private readonly handlers: SavedLoadoutsViewHandlers;
  private root: HTMLElement | undefined;
  private toggle: HTMLButtonElement | undefined;
  private popover: HTMLElement | undefined;
  private nameInput: HTMLInputElement | undefined;
  private saveButton: HTMLButtonElement | undefined;
  private list: HTMLElement | undefined;
  private empty: HTMLElement | undefined;
  private readonly disposers: (() => void)[] = [];
  private readonly rowDisposers: (() => void)[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /** @param handlers - Callbacks for Load, Delete, Save and the name field. */
  constructor(handlers: SavedLoadoutsViewHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Builds the button and its closed popover under `parent`; call `update` to fill the list. */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const root = doc.createElement("div");
    root.id = "saved-loadouts";
    root.className = "tut-mech-bay__library";

    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn";
    toggle.dataset.action = "toggle-loadouts";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-haspopup", "dialog");
    this.listen(toggle, "click", () => {
      this.setOpen(!this.open);
    });

    const popover = doc.createElement("div");
    popover.className = "tut-panel tut-panel--raised tut-mech-bay__popover";
    popover.dataset.role = "loadout-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Saved loadouts");
    popover.hidden = true;
    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Saved loadouts";

    const saveRow = doc.createElement("div");
    saveRow.className = "tut-row tut-mech-bay__save-row";
    const nameLabel = doc.createElement("label");
    nameLabel.className = "tut-label";
    nameLabel.textContent = "Name";
    const nameInput = doc.createElement("input");
    nameInput.type = "text";
    nameInput.className = "tut-input";
    nameInput.dataset.field = "loadout-name";
    nameInput.maxLength = NAME_MAX_LENGTH;
    nameInput.placeholder = "Loadout name";
    this.listen(nameInput, "input", () => {
      this.handlers.onNameChange(nameInput.value);
      this.refreshToggle();
    });
    const save = doc.createElement("button");
    save.type = "button";
    save.className = "tut-btn tut-btn--primary";
    save.dataset.action = "save-loadout";
    save.textContent = "Save";
    this.listen(save, "click", () => {
      this.handlers.onSave();
    });
    saveRow.append(nameLabel, nameInput, save);

    const list = doc.createElement("ul");
    list.className = "tut-list";
    list.dataset.role = "saved-list";
    const empty = doc.createElement("p");
    empty.className = "tut-dim";
    empty.dataset.role = "no-saved";
    empty.textContent = "No saved loadouts. Save the draft to keep it.";

    popover.append(title, saveRow, list, empty);
    root.append(toggle, popover);
    parent.appendChild(root);

    this.listen(doc, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape" && this.open) {
        this.setOpen(false);
      }
    });
    this.listen(doc, "mousedown", (event) => {
      const target = event.target;
      if (this.open && target instanceof Node && !root.contains(target)) {
        this.setOpen(false);
      }
    });

    this.root = root;
    this.toggle = toggle;
    this.popover = popover;
    this.nameInput = nameInput;
    this.saveButton = save;
    this.list = list;
    this.empty = empty;
    this.refreshToggle();
  }

  /** Rebuilds the rows from `loadouts`. */
  update(loadouts: readonly MechLoadout[]): void {
    if (!this.list || !this.empty) {
      return;
    }
    for (const dispose of this.rowDisposers.splice(0)) {
      dispose();
    }
    const doc = this.list.ownerDocument;
    this.list.replaceChildren(
      ...loadouts.map((loadout) => this.createRow(doc, loadout)),
    );
    this.empty.hidden = loadouts.length > 0;
  }

  /** Shows the draft's name in the field and on the button. */
  setName(name: string): void {
    if (this.nameInput && this.nameInput.value !== name) {
      this.nameInput.value = name;
    }
    this.refreshToggle();
  }

  /** Enables or disables Save; the owner knows whether the draft is saveable. */
  setSaveEnabled(enabled: boolean): void {
    if (this.saveButton) {
      this.saveButton.disabled = !enabled;
    }
  }

  /** Whether the popover is showing. */
  get open(): boolean {
    return this.popover !== undefined && !this.popover.hidden;
  }

  /** Opens or closes the popover. */
  setOpen(open: boolean): void {
    if (!this.popover || !this.toggle) {
      return;
    }
    this.popover.hidden = !open;
    this.toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      this.nameInput?.focus();
    }
  }

  /** Removes the button, the popover and every listener. */
  unmount(): void {
    for (const dispose of [
      ...this.rowDisposers.splice(0),
      ...this.disposers.splice(0),
    ]) {
      dispose();
    }
    this.root?.remove();
    this.root = undefined;
    this.toggle = undefined;
    this.popover = undefined;
    this.nameInput = undefined;
    this.saveButton = undefined;
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
    this.rowDisposers.push(() => {
      button.removeEventListener("click", handler);
    });
    return button;
  }

  /** Writes the draft's name onto the toggle button. */
  private refreshToggle(): void {
    if (!this.toggle) {
      return;
    }
    const name = this.nameInput?.value.trim() ?? "";
    this.toggle.textContent =
      name === "" ? "▴ Loadouts" : `▴ Loadouts · ${name}`;
  }

  /** Attaches a listener and remembers how to remove it. */
  private listen(
    target: HTMLElement | Document,
    event: string,
    handler: (event: Event) => void,
  ): void {
    target.addEventListener(event, handler);
    this.disposers.push(() => {
      target.removeEventListener(event, handler);
    });
  }
}
