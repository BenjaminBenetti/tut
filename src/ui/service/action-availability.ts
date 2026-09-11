import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { CombatTuning } from "../../tactical/model/combat-tuning";
import type { ObjectiveTuning } from "../../tactical/model/objective-tuning";
import type { TacticalError } from "../../tactical/model/tactical-error";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Team, Unit, UnitId } from "../../tactical/model/unit";
import { actingUnit } from "../../tactical/service/acting-unit";
import { weaponOptions } from "../../tactical/service/combat-service";
import type { ReachableObjective } from "../../tactical/service/objective-service";
import { reachableObjectives } from "../../tactical/service/objective-service";
import { reloadPools } from "../../tactical/service/reload-handler";

// ===========================================
// Types
// ===========================================

/** The actions a unit performs, and so the ones that can be refused (#1030). */
export type UnitAction =
  "move" | "attack" | "overwatch" | "reload" | "interact" | "extract";

/** Tuning the availability questions are asked against. */
export interface ActionAvailabilityDeps {
  /** Handed to `weaponOptions`; the HUD never judges ammunition itself. */
  readonly combatTuning: CombatTuning;
  /** Handed to `reachableObjectives`; the HUD never judges a distance itself. */
  readonly objectiveTuning: ObjectiveTuning;
}

// ===========================================
// Constants
// ===========================================

/** Which team acts in which phase. */
const TEAM_FOR_PHASE: Readonly<Record<TacticalState["phase"], Team>> = {
  player: "tdf",
  bugs: "bugs",
};

// ===========================================
// Availability
// ===========================================

/**
 * Why `action` cannot happen for `unitId`, or `undefined` when it can.
 *
 * Asks the rules rather than a boolean of its own: `actingUnit` is the
 * same precondition `overwatchHandler` and `reloadHandler` run, so a
 * wheel entry and the command cannot disagree about who may act. The
 * action-specific refusals stay where they already are — the aim preview
 * owns range and sight, and the move path owns reachability.
 *
 * ```
 *   extract  ──► actingUnit(0 AP) then standing on the zone
 *   attack   ──► actingUnit(1 AP) then any weapon with charges
 *   reload   ──► actingUnit(1 AP) then a pool that is not full
 *   interact ──► actingUnit(1 AP) then an objective in reach
 *   move / overwatch ──► actingUnit(1 AP)
 * ```
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit that would act.
 * @param action - What it would do.
 * @param deps - Tuning the rules are asked with.
 * @returns The refusal, or `undefined` when the action is open.
 */
export function actionRefusal(
  mission: TacticalState,
  unitId: UnitId,
  action: UnitAction,
  deps: ActionAvailabilityDeps,
): TacticalError | undefined {
  if (action === "extract") {
    // Leaving is free, so it does not spend an action point.
    const acting = actingUnit(mission, unitId, 0);
    if (!acting.ok) {
      return acting.error;
    }
    return canExtract(mission, acting.value)
      ? undefined
      : { kind: "not-in-extraction-zone", unitId };
  }
  const acting = actingUnit(mission, unitId, 1);
  if (!acting.ok) {
    return acting.error;
  }
  if (action === "attack") {
    // The rules already answer this per weapon: `weaponOptions` runs
    // `refuseWeapon`, which checks charges. Every weapon, not the first:
    // a mech with a dry autocannon and a loaded missile pod can still
    // shoot, so the refusal only stands when nothing on the unit can
    // fire (#1062).
    const options = weaponOptions(mission, unitId, deps.combatTuning);
    const spent =
      options.length > 0 && options.every((option) => !option.ready);
    const refusal = spent ? options[0]?.refusal : undefined;
    if (refusal !== undefined) {
      return refusal;
    }
  }
  if (action === "reload") {
    // The same question the command answers, asked once.
    const pools = reloadPools(mission, acting.value);
    if (!pools.ok) {
      return pools.error;
    }
  }
  if (
    action === "interact" &&
    interactTarget(mission, unitId, deps.objectiveTuning) === undefined
  ) {
    // Its own kind, because none of the existing objective errors is
    // true here: nothing is missing or finished, there is simply nothing
    // within reach.
    return { kind: "no-objective-in-reach", unitId };
  }
  return undefined;
}

/**
 * True when the unit can leave the map: a living unit of the acting
 * side standing on an extraction tile (#341). Action points do not
 * matter — walking out is free, so a unit that spent its turn reaching
 * the zone still leaves on the same turn.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit that would board.
 * @returns Whether `Extract` would be accepted.
 */
export function canExtract(mission: TacticalState, unit: Unit): boolean {
  return (
    unit.hp > 0 &&
    unit.team === TEAM_FOR_PHASE[mission.phase] &&
    mission.extraction.some((tile) => sameTile(tile, unit.pos))
  );
}

/**
 * The objective Interact would work: the nearest one the unit can reach,
 * or undefined when there is none. The rules answer this
 * (`reachableObjectives`), so the wheel offers exactly what the handler
 * would accept.
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit that would act.
 * @param tuning - Reach and cost of interacting.
 * @returns The nearest reachable objective, if any.
 */
export function interactTarget(
  mission: TacticalState,
  unitId: UnitId,
  tuning: ObjectiveTuning,
): ReachableObjective | undefined {
  return reachableObjectives(mission, unitId, tuning)[0];
}

/**
 * Whether a tile is part of the drop ship: one of its boarding tiles
 * (the extraction zone) or a tile under the aircraft itself.
 *
 * Extract is boarding the drop ship rather than a button of its own, so
 * the wheel needs to know when the player has clicked the ship. The map
 * draws the ship as a box over its footprint, and a click on the box
 * lands on the footprint tile beneath it; the extraction zone is the
 * ramp's boarding tiles beside it. Either is "the drop ship" to a player.
 *
 * @param mission - The mission, for its extraction tiles and map.
 * @param tile - The tile that was clicked.
 * @returns True when the click was on the ship or its boarding zone.
 */
export function isDropshipTile(
  mission: TacticalState,
  tile: TileCoord,
): boolean {
  if (mission.extraction.some((zone) => sameTile(zone, tile))) {
    return true;
  }
  return (mission.map.dropships ?? []).some(
    (site) =>
      tile.x >= site.footprint.x &&
      tile.x < site.footprint.x + site.footprint.w &&
      tile.z >= site.footprint.z &&
      tile.z < site.footprint.z + site.footprint.d,
  );
}

// ===========================================
// Helpers
// ===========================================

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
