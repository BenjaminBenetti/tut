import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit, UnitId } from "../../tactical/model/unit";
import { formatWhole } from "../service/format";
import { iconGlyph } from "./icon-glyph";

// ===========================================
// Model
// ===========================================

/** What the strip needs from the caller: the force, and who is selected. */
export interface SquadStripModel {
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
    this.root?.remove();
    this.root = undefined;
    this.list = undefined;
    this.count = undefined;
  }

  // ===========================================
  // Rendering
  // ===========================================

  /**
   * Rebuilds the rows from the force.
   *
   * @param model - The units, the selection, and the name resolver.
   */
  update(model: SquadStripModel | undefined): void {
    const list = this.list;
    const root = this.root;
    if (!list || !root || !this.count) {
      return;
    }
    if (!model || model.units.length === 0) {
      root.hidden = true;
      list.replaceChildren();
      return;
    }
    root.hidden = false;
    const doc = list.ownerDocument;
    const standing = model.units.filter((unit) => unit.hp > 0);
    const unspent = standing.filter((unit) => unit.ap > 0).length;
    // Named rather than counted silently: ending a turn with units that
    // have not acted used to say nothing at all.
    this.count.textContent =
      unspent > 0 ? `${formatWhole(unspent)} to act` : "all done";

    list.replaceChildren();
    for (const unit of standing) {
      const row = doc.createElement("li");
      row.dataset.unitId = unit.id;
      row.dataset.selected = unit.id === model.selectedId ? "true" : "false";
      row.dataset.spent = unit.ap > 0 ? "false" : "true";

      const name = doc.createElement("span");
      name.className = "tut-squad__name";
      name.textContent = model.nameOf(unit.id);

      const hp = doc.createElement("span");
      hp.className = "tut-mono tut-dim";
      hp.textContent = `${formatWhole(unit.hp)} hp`;

      const ap = doc.createElement("span");
      ap.className = "tut-mono";
      ap.dataset.role = "squad-ap";
      // A dot rather than "0 AP": the eye is counting who can still act,
      // and a zero reads as a number to compare rather than a state.
      ap.textContent = unit.ap > 0 ? `${formatWhole(unit.ap)} AP` : "·";

      row.append(iconGlyph(doc, unit.kind === "mech" ? "mech" : "squad"));
      row.append(name, hp, ap);
      row.addEventListener("click", () => {
        this.handlers.onPick(unit.id);
      });
      list.appendChild(row);
    }
  }
}

/** The units on the player's side, in mission order. */
export function playerUnits(mission: TacticalState): readonly Unit[] {
  return mission.units.filter((unit) => unit.team === "tdf");
}
