import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { RadarContact } from "../model/radar";
import type { TacticalState } from "../model/tactical-state";
import type { Team, Unit } from "../model/unit";
import { isBurrowed } from "../model/unit";
import { unitFootprintTiles } from "./footprint-service";

// ===========================================
// Seismic sensor (campaign arc §10.2)
// ===========================================
//
// The Burrower autopsy's counter. A mech fitting the sensor carries
// `systems.seismicRange` on its template; while it stands on the field
// alive, every burrowed enemy whose column lies within that many tiles
// of it — Manhattan on the ground plane, the measure a burrower tunnels
// by, and through walls, floors and fog alike — is reported to its
// side as a location-only `"burrowed"` contact.
//
//   ┌───────────────────────────── range 10 ─────────────────────────────┐
//   │  M  mech with the sensor        b  burrowed bug inside the range   │
//   │                                    ──► contact on b's column       │
//   │                                 b' burrowed bug beyond it ──► none │
//   └────────────────────────────────────────────────────────────────────┘
//
// It is knowledge, never a rule. A sensed burrower is still under the
// ground, so every burrow guarantee stands (`isBurrowed`): it is not
// spotted, cannot be shot, blasted, burnt or netted, triggers no
// overwatch, holds no tile and keeps spawns off its column. What the
// squad gains is warning: where it lies, so the squad can step away or
// put a watcher over the tiles it will come up on (`Surface` runs the
// overwatch reaction). Targeting is physics and the sensor is intel;
// letting a known burrower be hit where an unknown one could not would
// make what the ground stops depend on who is listening.
//
// The contacts are the side's, like its vision (ADR 0006): every unit of
// the side shares them, whichever mech carries the sensor. Nothing on
// the swarm's side reads them, so the bug AI and Jev learn nothing new.

// ===========================================
// Queries
// ===========================================

/**
 * How far `unit` feels burrowed bugs through the ground, in tiles: its
 * template's `systems.seismicRange` while it is alive, `0` when it is
 * dead or carries no sensor. A unit that has left the field (extracted,
 * left behind) is no longer in `mission.units` and so is never asked.
 *
 * @param mission - The mission the unit is in.
 * @param unit - The unit that might carry a sensor.
 * @returns Its seismic range; `0` for none.
 */
export function seismicRangeOf(mission: TacticalState, unit: Unit): number {
  if (unit.hp <= 0) {
    return 0;
  }
  return Math.max(
    0,
    mission.templates[unit.templateId]?.systems?.seismicRange ?? 0,
  );
}

/**
 * Whether one sensor on the field feels a burrowed bug at `pos`: its
 * column within the carrier's seismic range of any tile the carrier
 * stands on, Manhattan on the ground plane.
 *
 * @param mission - The mission.
 * @param carrier - A unit with a seismic range.
 * @param pos - The burrowed bug's position.
 * @returns True when that column is inside the range.
 */
export function feelsColumn(
  mission: TacticalState,
  carrier: Unit,
  pos: TileCoord,
): boolean {
  const range = seismicRangeOf(mission, carrier);
  return (
    range > 0 &&
    unitFootprintTiles(mission, carrier).some(
      (tile) => manhattanDistance(tile, pos) <= range,
    )
  );
}

/**
 * The burrowed enemies `team`'s seismic sensors feel right now, as
 * location-only contacts on their columns (campaign arc §10.2). Every
 * living unit of the side that carries a sensor listens; a living
 * enemy under the ground within any one's range is reported once.
 * Recomputed from the state on every call, like `radarContacts`, so
 * it follows the burrower as it tunnels and drops it the moment it
 * surfaces (a surfaced bug is vision's to spot) or the last carrier in
 * range falls or leaves.
 *
 * ```
 *   carriers = team's living units with seismicRange > 0
 *   enemies under the ground, alive, within any carrier's range
 *     ──► { kind: "burrowed", pos }   in mission.units order
 * ```
 *
 * @param mission - The mission.
 * @param team - The side listening.
 * @returns One contact per burrowed enemy felt; empty with no sensor.
 */
export function seismicContacts(
  mission: TacticalState,
  team: Team,
): readonly RadarContact[] {
  const carriers = mission.units.filter(
    (unit) => unit.team === team && seismicRangeOf(mission, unit) > 0,
  );
  if (carriers.length === 0) {
    return [];
  }
  return mission.units
    .filter(
      (unit) =>
        unit.team !== team &&
        unit.hp > 0 &&
        isBurrowed(unit) &&
        carriers.some((carrier) => feelsColumn(mission, carrier, unit.pos)),
    )
    .map((unit): RadarContact => ({ kind: "burrowed", pos: unit.pos }));
}
