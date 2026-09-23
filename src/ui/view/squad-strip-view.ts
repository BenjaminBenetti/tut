import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { isAutonomous } from "../../tactical/model/unit";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";
import { JEV_PROMPT_MAX_LENGTH } from "../../tactical/model/jev-control";
import type { JevEntityControl } from "../../tactical/model/jev-control";

// ===========================================
// Model
// ===========================================

/** The force, battlefield selection, and current control settings. */
export interface SquadStripModel {
  readonly missionId: string;
  readonly units: readonly Unit[];
  readonly selectedId: UnitId | undefined;
  readonly controls?: Readonly<Record<UnitId, JevEntityControl>>;
  readonly jevAvailable: boolean;
  readonly editable: boolean;
  /** Display name for a unit, from the shared resolver. */
  readonly nameOf: (unitId: UnitId) => string;
}

/** Battlefield selection and staged bulk edits reported to the HUD. */
export interface SquadStripHandlers {
  /** Select this unit, and bring it on screen if it is not. */
  readonly onPick: (unitId: UnitId) => void;
  /** Apply the checked set while preserving every unit's own prompt. */
  readonly onApplyJev: (unitIds: readonly UnitId[]) => void;
  /** Replace only the selected units' prompts, preserving control settings. */
  readonly onApplyOrders: (unitIds: readonly UnitId[], prompt: string) => void;
  /** Hold automatic play until a bulk edit is applied or cancelled. */
  readonly onEditingChange: (editing: boolean) => void;
}

/** Compact overview of one unit's name and remaining health and actions. */
interface SquadRow {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly hp: HTMLElement;
  readonly ap: HTMLElement;
  readonly icon: HTMLElement;
  readonly choice: HTMLElement;
}

/** The footer button owns the active selection mode until Apply or Cancel. */
type SquadEditMode = "jev" | "orders";

// ===========================================
// View
// ===========================================

/**
 * The player's own force, at a glance (#1041).
 *
 * ```
 *   ┌ SQUAD ─────────────── 2 to act ┐
 *   │ ▸ Hammerhead     80 hp   2 AP  │
 *   │   Rifle Squad    20 hp   ·     │
 *   └────────────────────────────────┘
 * ```
 *
 * Before this the interface knew the squad only through whichever unit
 * was selected: readiness was answerable only by clicking each unit in
 * turn, which QA measured at 473 px of mouse travel per round trip, and
 * a unit selected off screen had no way back. Both are the same missing
 * thing — a view of the force rather than of one member.
 *
 * A row selects *and* centres the camera, so the row is the affordance
 * rather than a separate "find my unit" control the player must learn.
 * Footer selection modes reuse the compact rows as checkboxes and save
 * control settings or shared unit orders only when Apply is pressed.
 */
export class SquadStripView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private count: HTMLElement | undefined;
  private readonly handlers: SquadStripHandlers;
  private missionId?: string;
  private readonly rows = new Map<UnitId, SquadRow>();
  private model?: SquadStripModel;
  private mode?: SquadEditMode;
  private readonly checked = new Set<UnitId>();
  private jevButton?: HTMLButtonElement;
  private ordersButton?: HTMLButtonElement;
  private ordersLabel?: HTMLElement;
  private cancelButton?: HTMLButtonElement;
  private promptField?: HTMLElement;
  private promptInput?: HTMLTextAreaElement;
  private selectionHint?: HTMLElement;

  /**
   * @param handlers - What a click on a row asks for.
   */
  constructor(handlers: SquadStripHandlers) {
    this.handlers = handlers;
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /**
   * Builds the panel under `parent`; call `update` to fill it.
   *
   * @param parent - The rail to mount into.
   */
  mount(parent: HTMLElement): void {
    const doc = parent.ownerDocument;
    const section = doc.createElement("section");
    section.id = "squad-strip";
    section.className = "tut-panel tut-hud__squad";

    const title = doc.createElement("div");
    title.className = "tut-panel__title";
    title.textContent = "Squad";
    const count = doc.createElement("span");
    count.className = "tut-mono tut-dim";
    count.dataset.field = "squad-unspent";
    title.appendChild(count);

    const list = doc.createElement("ul");
    list.className = "tut-list";
    list.dataset.role = "squad-list";

    const hint = doc.createElement("p");
    hint.className = "tut-squad__hint tut-dim";
    hint.dataset.testid = "squad-selection-hint";
    hint.setAttribute("role", "status");
    const promptField = doc.createElement("label");
    promptField.className = "tut-squad__prompt";
    promptField.textContent = "Orders for selected units";
    const input = doc.createElement("textarea");
    input.className = "tut-input";
    input.dataset.testid = "squad-orders-input";
    input.rows = 3;
    input.maxLength = JEV_PROMPT_MAX_LENGTH;
    input.placeholder = "Follow Alpha. Cover the squad and stay out of danger.";
    input.addEventListener("input", () => this.renderSelection());
    input.addEventListener("wheel", (event) => event.stopPropagation(), {
      passive: true,
    });
    promptField.append(input);
    const footer = doc.createElement("div");
    footer.className = "tut-squad__bulk-controls";
    const jev = doc.createElement("button");
    jev.type = "button";
    jev.className = "tut-btn tut-squad__jev";
    jev.dataset.testid = "squad-jev-toggle";
    jev.addEventListener("click", () => this.activateMode("jev"));
    const orders = doc.createElement("button");
    orders.type = "button";
    orders.className = "tut-btn";
    orders.dataset.testid = "squad-orders-toggle";
    const ordersLabel = doc.createElement("span");
    orders.append(iconGlyph(doc, "command"), ordersLabel);
    orders.addEventListener("click", () => this.activateMode("orders"));
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.className = "tut-btn";
    cancel.dataset.testid = "squad-selection-cancel";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.cancelEdit());
    footer.append(jev, orders, cancel);
    section.addEventListener("keydown", (event) => {
      if (this.mode && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelEdit();
      } else if (
        this.mode ||
        footer.contains(event.target as Node) ||
        event.target === input
      ) {
        event.stopPropagation();
      }
    });
    section.append(title, list, hint, promptField, footer);
    parent.appendChild(section);
    this.root = section;
    this.list = list;
    this.count = count;
    this.jevButton = jev;
    this.ordersButton = orders;
    this.ordersLabel = ordersLabel;
    this.cancelButton = cancel;
    this.promptField = promptField;
    this.promptInput = input;
    this.selectionHint = hint;
    this.renderSelection();
  }

  /** Removes the panel. */
  unmount(): void {
    this.cancelEdit(false);
    this.clearRows();
    this.missionId = undefined;
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.count = undefined;
    this.model = undefined;
    this.jevButton = undefined;
    this.ordersButton = undefined;
    this.ordersLabel = undefined;
    this.cancelButton = undefined;
    this.promptField = undefined;
    this.promptInput = undefined;
    this.selectionHint = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /**
   * Refreshes compact rows while preserving the selection and readiness overview.
   *
   * @param model - The units, the selection, and the name resolver.
   */
  update(model: SquadStripModel | undefined): void {
    const list = this.list;
    const root = this.root;
    if (!list || !root || !this.count) {
      return;
    }
    this.model = model;
    if (this.missionId !== model?.missionId || !model?.editable) {
      this.cancelEdit(false);
    }
    if (this.missionId !== model?.missionId) {
      this.clearRows();
      this.missionId = model?.missionId;
    }
    const standing = model?.units.filter((unit) => unit.hp > 0) ?? [];
    if (!model || standing.length === 0) {
      this.cancelEdit(false);
      root.hidden = true;
      this.clearRows();
      return;
    }
    root.hidden = false;
    const unspent = standing.filter((unit) => unit.ap > 0).length;
    // Named rather than counted silently: ending a turn with units that
    // have not acted used to say nothing at all.
    this.count.textContent =
      unspent > 0 ? `${formatWhole(unspent)} to act` : "all done";

    const ids = new Set(standing.map((unit) => unit.id));
    for (const [id, row] of this.rows) {
      if (ids.has(id)) continue;
      row.root.remove();
      this.rows.delete(id);
      this.checked.delete(id);
    }
    for (const [index, unit] of standing.entries()) {
      let row = this.rows.get(unit.id);
      if (!row) {
        row = this.createRow(unit);
        this.rows.set(unit.id, row);
      }
      // Keep existing rows in place when the force's order has not changed.
      if (list.children[index] !== row.root)
        list.insertBefore(row.root, list.children[index] ?? null);
      const name = model.nameOf(unit.id);
      row.root.dataset.spent = String(unit.ap <= 0);
      row.name.textContent = name;
      row.hp.textContent = `${formatWhole(unit.hp)} hp`;
      row.ap.textContent = unit.ap > 0 ? `${formatWhole(unit.ap)} AP` : "·";
    }
    this.renderSelection();
  }

  /** Build a compact row that selects the actor normally or toggles a pending bulk choice. */
  private createRow(unit: Unit): SquadRow {
    const doc = this.list!.ownerDocument;
    const row = doc.createElement("li");
    row.dataset.unitId = unit.id;
    const name = doc.createElement("span");
    name.className = "tut-squad__name";
    const hp = doc.createElement("span");
    hp.className = "tut-mono tut-dim";
    hp.dataset.role = "squad-hp";
    const ap = doc.createElement("span");
    ap.className = "tut-mono";
    ap.dataset.role = "squad-ap";
    const icon = iconGlyph(doc, unit.kind === "mech" ? "mech" : "squad");
    const choice = doc.createElement("span");
    choice.className = "tut-squad__choice";
    choice.setAttribute("aria-hidden", "true");
    row.append(icon, choice, name, hp, ap);
    row.tabIndex = 0;
    row.addEventListener("click", () => this.pick(unit.id));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      this.pick(unit.id);
    });
    return { root: row, name, hp, ap, icon, choice };
  }

  /** Enter a fresh selection mode, or apply its pending changes with the same footer button. */
  private activateMode(mode: SquadEditMode): void {
    if (!this.model?.editable) return;
    if (mode === this.mode) {
      if (!this.canApply()) return;
      const selected = [...this.checked];
      if (mode === "jev") this.handlers.onApplyJev(selected);
      else this.handlers.onApplyOrders(selected, this.promptInput?.value ?? "");
      this.cancelEdit();
      return;
    }
    if (mode === "jev" && !this.canEditJev()) return;
    const wasEditing = this.mode !== undefined;
    this.mode = mode;
    this.checked.clear();
    if (mode === "jev") {
      for (const id of this.rows.keys())
        if (this.model.controls?.[id]?.enabled) this.checked.add(id);
    }
    if (this.promptInput) this.promptInput.value = "";
    this.renderSelection();
    if (!wasEditing) this.handlers.onEditingChange(true);
    if (mode === "orders") this.promptInput?.focus();
  }

  /** Restore normal row selection without committing any draft. */
  private cancelEdit(restoreFocus = true): void {
    const previous = this.mode;
    this.mode = undefined;
    this.checked.clear();
    if (this.promptInput) this.promptInput.value = "";
    this.renderSelection();
    if (!previous) return;
    this.handlers.onEditingChange(false);
    if (restoreFocus)
      (previous === "jev" ? this.jevButton : this.ordersButton)?.focus();
  }

  /** Bulk clicks never change the battlefield selection or move the camera. */
  private pick(unitId: UnitId): void {
    if (!this.mode) {
      this.handlers.onPick(unitId);
      return;
    }
    if (this.pickDisabled(unitId)) return;
    if (this.checked.has(unitId)) this.checked.delete(unitId);
    else this.checked.add(unitId);
    this.renderSelection();
  }

  /** Existing Jev units may return to player control even with the service unavailable. */
  private canEditJev(): boolean {
    return (
      this.model?.jevAvailable === true ||
      [...this.rows.keys()].some((id) => this.model?.controls?.[id]?.enabled)
    );
  }

  /** Refuse only new opt-ins while offline, leaving already checked choices removable. */
  private pickDisabled(unitId: UnitId): boolean {
    return (
      !this.model?.editable ||
      (this.mode === "jev" &&
        !this.model.jevAvailable &&
        !this.model.controls?.[unitId]?.enabled &&
        !this.checked.has(unitId))
    );
  }

  /** Empty Jev selection releases everyone; an orders edit needs at least one recipient. */
  private canApply(): boolean {
    if (!this.model?.editable) return false;
    if (this.mode === "orders")
      return (
        this.checked.size > 0 &&
        (this.promptInput?.value.length ?? 0) <= JEV_PROMPT_MAX_LENGTH
      );
    return (
      this.mode === "jev" &&
      [...this.checked].every(
        (id) =>
          this.model?.jevAvailable === true ||
          this.model?.controls?.[id]?.enabled === true,
      )
    );
  }

  /** Keep the footer and checkmarks in sync without rebuilding focused rows or the editor. */
  private renderSelection(): void {
    if (this.root) this.root.dataset.bulkMode = this.mode ?? "none";
    for (const [id, row] of this.rows) {
      const checked = this.checked.has(id);
      row.root.dataset.selected = String(
        !this.mode && id === this.model?.selectedId,
      );
      row.root.dataset.bulkSelected = String(
        this.mode !== undefined && checked,
      );
      row.root.setAttribute("role", this.mode ? "checkbox" : "button");
      row.root.setAttribute("aria-label", row.name.textContent ?? id);
      if (this.mode) {
        row.root.setAttribute("aria-checked", String(checked));
        row.root.setAttribute("aria-disabled", String(this.pickDisabled(id)));
      } else {
        row.root.removeAttribute("aria-checked");
        row.root.removeAttribute("aria-disabled");
      }
      row.icon.hidden = this.mode !== undefined;
      row.choice.hidden = this.mode === undefined;
      row.choice.textContent = checked ? "✓" : "";
    }
    if (this.jevButton) {
      this.jevButton.textContent = this.mode === "jev" ? "Apply" : "Jev";
      this.jevButton.setAttribute("aria-pressed", String(this.mode === "jev"));
      this.jevButton.classList.toggle("is-selected", this.mode === "jev");
      this.jevButton.disabled =
        !this.model?.editable ||
        (this.mode === "jev" ? !this.canApply() : !this.canEditJev());
      this.jevButton.title =
        this.mode === "jev"
          ? "Apply Jev control to the checked units"
          : this.canEditJev()
            ? "Choose units for Jev control"
            : "Jev control is unavailable";
    }
    if (this.ordersButton) {
      this.ordersButton.setAttribute(
        "aria-pressed",
        String(this.mode === "orders"),
      );
      this.ordersButton.classList.toggle("is-selected", this.mode === "orders");
      this.ordersButton.setAttribute(
        "aria-label",
        this.mode === "orders"
          ? "Apply orders to selected units"
          : "Set orders for multiple units",
      );
      this.ordersButton.title = this.ordersButton.getAttribute("aria-label")!;
      this.ordersButton.disabled =
        !this.model?.editable || (this.mode === "orders" && !this.canApply());
    }
    if (this.ordersLabel)
      this.ordersLabel.textContent = this.mode === "orders" ? "Apply" : "";
    if (this.cancelButton) this.cancelButton.hidden = this.mode === undefined;
    if (this.promptField) this.promptField.hidden = this.mode !== "orders";
    if (this.selectionHint) {
      this.selectionHint.hidden = this.mode === undefined;
      this.selectionHint.textContent =
        this.mode === "jev"
          ? `${String(this.checked.size)} selected for Jev. Uncheck for player control.`
          : `${String(this.checked.size)} selected. Write orders, then Apply.`;
    }
  }

  /** Remove old rows when the mission changes or the panel closes. */
  private clearRows(): void {
    for (const row of this.rows.values()) {
      row.root.remove();
    }
    this.rows.clear();
  }
}

/**
 * The units on the player's side that take orders, in mission order. A
 * deployed turret (#1138) is left out: the strip counts who has still
 * to act, and a turret never acts on command — it is read by clicking
 * it on the map, where its card shows the battery.
 */
export function playerUnits(mission: TacticalState): readonly Unit[] {
  return mission.units.filter(
    (unit) => unit.team === "tdf" && !isAutonomous(unit),
  );
}
