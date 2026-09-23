import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { isAutonomous } from "../../tactical/model/unit";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Model
// ===========================================

/** What the strip needs from the caller: the force, and who is selected. */
export interface SquadStripModel {
  readonly missionId: string;
  readonly units: readonly Unit[];
  readonly selectedId: UnitId | undefined;
  /** Display name for a unit, from the shared resolver. */
  readonly nameOf: (unitId: UnitId) => string;
}

/** What a click on a row asks for. */
export interface SquadStripHandlers {
  /** Select this unit, and bring it on screen if it is not. */
  readonly onPick: (unitId: UnitId) => void;
}

/** Compact overview of one unit's name and remaining health and actions. */
interface SquadRow {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly hp: HTMLElement;
  readonly ap: HTMLElement;
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

    section.append(title, list);
    parent.appendChild(section);
    this.root = section;
    this.list = list;
    this.count = count;
  }

  /** Removes the panel. */
  unmount(): void {
    this.clearRows();
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
      row.root.remove();
      this.rows.delete(id);
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
      row.root.dataset.selected = String(unit.id === model.selectedId);
      row.root.dataset.spent = String(unit.ap <= 0);
      row.name.textContent = name;
      row.hp.textContent = `${formatWhole(unit.hp)} hp`;
      row.ap.textContent = unit.ap > 0 ? `${formatWhole(unit.ap)} AP` : "·";
    }
  }

  /** Build a single-line row whose only action is selecting the unit. */
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
    row.append(
      iconGlyph(doc, unit.kind === "mech" ? "mech" : "squad"),
      name,
      hp,
      ap,
    );
    row.addEventListener("click", () => this.handlers.onPick(unit.id));
    return { root: row, name, hp, ap };
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
