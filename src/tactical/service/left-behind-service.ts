import { isCivilian } from "../model/civilian";
import { isGenerator } from "../model/generator";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";

// ===========================================
// The force on the map
// ===========================================

/**
 * The player's units still alive on the map (#1132): every living TDF
 * unit in `units` order, turrets included, generators and civilian
 * groups not. A generator is the installation's, not the force's
 * (#1175): it is neither stranded nor written off when the squad
 * leaves. Nor is a civilian group (campaign arc §6.4): it is not a
 * roster entry, and the rescue objective's tally already counts it as
 * not saved. Units that boarded are in `extracted`, not here.
 *
 * ```
 *   tdf, hp > 0: squad, mech, turret ──► standing
 *   generator, civilian group, bug, dead ──► not
 * ```
 *
 * @param mission - The mission as it stands.
 * @returns The units leaving now would strand.
 */
export function standingForce(mission: TacticalState): readonly Unit[] {
  return mission.units.filter(
    (unit) =>
      unit.team === "tdf" &&
      unit.hp > 0 &&
      !isGenerator(unit) &&
      !isCivilian(unit),
  );
}

// ===========================================
// Leaving them behind
// ===========================================

/**
 * Leaves every unit of the force still on the map behind: its hit
 * points go to zero, so the resolver reads it as wiped or destroyed
 * exactly as if it had fallen, and one `UnitAbandoned` names it, so the
 * debrief lists it as left behind rather than as a casualty. Both the
 * player abandoning the mission (#1132) and Dust-off Window's drop ship
 * leaving (campaign arc §11) go through here, so a unit is lost the
 * same way whichever left it.
 *
 * ```
 *   standingForce(mission) ──► hp 0, UnitAbandoned each, in units order
 *   everyone else (bugs, the dead, generators, civilian groups,
 *   the extracted) ──► untouched
 * ```
 *
 * Records no outcome: the caller decides how the mission ends. Pure.
 *
 * @param mission - The mission as it stands.
 * @returns The mission with the force stranded, and one event per unit.
 */
export function leaveBehind(
  mission: TacticalState,
): TacticalApplied<TacticalState> {
  const stranded = new Set(standingForce(mission).map((unit) => unit.id));
  if (stranded.size === 0) {
    return { state: mission, events: [] };
  }
  const units = mission.units.map((unit) =>
    stranded.has(unit.id) ? { ...unit, hp: 0 } : unit,
  );
  const events: TacticalEvent[] = [...stranded].map((unitId) => ({
    type: UNIT_ABANDONED,
    payload: { unitId },
  }));
  return { state: { ...mission, units }, events };
}
