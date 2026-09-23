import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { isAutonomous } from "../../tactical/model/unit";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";
import type { JevEntityControl } from "../../tactical/model/jev-control";
import { OrdersPromptView } from "./orders-prompt-view";

// ===========================================
// Model
// ===========================================

/** What the strip needs from the caller: the force, and who is selected. */
export interface SquadStripModel {
  readonly missionId: string;
  readonly controls?: Readonly<Record<string, JevEntityControl>>;
  readonly jevAvailable: boolean;
  readonly editable: boolean;
  readonly units: readonly Unit[];
  readonly selectedId: UnitId | undefined;
  /** Display name for a unit, from the shared resolver. */
  readonly nameOf: (unitId: UnitId) => string;
}

/** What a click on a row asks for. */
export interface SquadStripHandlers {
  /** Select this unit, and bring it on screen if it is not. */
  readonly onPick: (unitId: UnitId) => void;
  /** Toggle only this unit's controller, preserving its saved orders. */
  readonly onToggleJev: (unitId: UnitId) => void;
  /** Save only this unit's orders, preserving its control setting. */
  readonly onEntityPrompt: (unitId: UnitId, prompt: string) => void;
}

/** Stable row elements keep keyboard focus and open drafts through state updates. */
interface SquadRow {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly hp: HTMLElement;
  readonly ap: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly orders: OrdersPromptView;
}

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
 */
export class SquadStripView {
  // ===========================================
  // Fields
  // ===========================================

  private root: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private count: HTMLElement | undefined;
  private readonly handlers: SquadStripHandlers;
  private overlay?: HTMLElement;
  private missionId?: string;
  private readonly rows = new Map<UnitId, SquadRow>();

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
  mount(parent: HTMLElement, overlay: HTMLElement): void {
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

    section.append(title, list);
    parent.appendChild(section);
    this.overlay = overlay;
    this.root = section;
    this.list = list;
    this.count = count;
  }

  /** Removes the panel. */
  unmount(): void {
    this.clearRows();
    this.overlay = undefined;
    this.missionId = undefined;
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.count = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /**
   * Refreshes stable rows without replacing active editors or focused controls.
   *
   * @param model - The units, the selection, and the name resolver.
   */
  update(model: SquadStripModel | undefined): void {
    const list = this.list;
    const root = this.root;
    if (!list || !root || !this.count) {
      return;
    }
    if (this.missionId !== model?.missionId) {
      this.clearRows();
      this.missionId = model?.missionId;
    }
    if (!model || model.units.length === 0) {
      root.hidden = true;
      this.clearRows();
      return;
    }
    root.hidden = false;
    const standing = model.units.filter((unit) => unit.hp > 0);
    const unspent = standing.filter((unit) => unit.ap > 0).length;
    // Named rather than counted silently: ending a turn with units that
    // have not acted used to say nothing at all.
    this.count.textContent =
      unspent > 0 ? `${formatWhole(unspent)} to act` : "all done";

    const ids = new Set(standing.map((unit) => unit.id));
    for (const [id, row] of this.rows) {
      if (ids.has(id)) continue;
      row.orders.unmount();
      row.root.remove();
      this.rows.delete(id);
    }
    for (const [index, unit] of standing.entries()) {
      let row = this.rows.get(unit.id);
      if (!row) {
        row = this.createRow(unit);
        this.rows.set(unit.id, row);
      }
      // Moving an existing focused node unnecessarily can blur its editor.
      if (list.children[index] !== row.root)
        list.insertBefore(row.root, list.children[index] ?? null);
      const name = model.nameOf(unit.id);
      const control = model.controls?.[unit.id];
      const enabled = control?.enabled === true;
      row.root.dataset.selected = String(unit.id === model.selectedId);
      row.root.dataset.spent = String(unit.ap <= 0);
      row.root.dataset.jev = String(enabled);
      row.name.textContent = name;
      row.hp.textContent = `${formatWhole(unit.hp)} hp`;
      row.ap.textContent = unit.ap > 0 ? `${formatWhole(unit.ap)} AP` : "·";
      row.toggle.setAttribute("aria-label", `Jev control for ${name}`);
      row.toggle.setAttribute("aria-pressed", String(enabled));
      row.toggle.disabled =
        !model.editable || (!enabled && !model.jevAvailable);
      row.toggle.title =
        !enabled && !model.jevAvailable
          ? "Jev control is unavailable"
          : enabled
            ? "Switch to player control"
            : "Switch to Jev control";
      row.orders.update({
        contextId: model.missionId,
        title: `${name} orders`,
        toggleLabel: `Command ${name}`,
        prompt: control?.entityPrompt ?? "",
        editable: model.editable,
      });
    }
  }

  /** Build one row with independent controller and orders buttons. */
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
    const controls = doc.createElement("div");
    controls.className = "tut-squad__controls";
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "tut-btn tut-squad__jev";
    toggle.dataset.testid = "unit-jev-toggle";
    toggle.textContent = "Jev";
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      this.handlers.onToggleJev(unit.id);
    });
    controls.addEventListener("keydown", (event) => event.stopPropagation());
    controls.append(toggle);
    const orders = new OrdersPromptView(
      (prompt) => this.handlers.onEntityPrompt(unit.id, prompt),
      {
        id: `entity-orders-${unit.id}`,
        toggleTestId: "entity-command-toggle",
        panelTestId: "entity-orders-popover",
        inputTestId: "entity-orders-input",
        toggleLabel: "Command unit",
        title: "Unit orders",
        fieldLabel: "Unit orders",
        hint: "Orders for this unit when Jev controls it. Shared commander orders take priority when they conflict.",
        placeholder: "Follow Alpha. Cover the squad and stay out of danger.",
        iconOnly: true,
      },
    );
    orders.mount(controls, this.overlay);
    row.append(
      iconGlyph(doc, unit.kind === "mech" ? "mech" : "squad"),
      name,
      hp,
      ap,
      controls,
    );
    row.addEventListener("click", () => this.handlers.onPick(unit.id));
    return { root: row, name, hp, ap, toggle, orders };
  }

  /** Dispose editor document listeners when units leave or the mission changes. */
  private clearRows(): void {
    for (const row of this.rows.values()) {
      row.orders.unmount();
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
