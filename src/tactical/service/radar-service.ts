import type { IdGenerator } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Radar, RadarContact, RadarTuning } from "../model/radar";
import { radarIsActive } from "../model/radar";
import { RADAR_BURNED_OUT } from "../model/radar-burned-out-event";
import { RADAR_DEPLOYED } from "../model/radar-deployed-event";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import type { Team, Unit } from "../model/unit";
import { isBurrowed, passMaskFor } from "../model/unit";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph, occupiedKeys } from "./movement-service";
import type { PhaseStep } from "./turn-service";

// ===========================================
// Deployment
// ===========================================

/**
 * Whether a scanner may be put on `tile` by a unit standing where
 * `unit` stands (#1132: the site alone; who may deploy, whether it has
 * a use and an action left, is `equipment-service`'s question): a free,
 * reachable surface within `range` straight-line tiles on the ground
 * plane, at most a layer up or down. Range 2 since #1130, so a diagonal
 * neighbour (which measures 1.41) is legal; a burnt-out scanner still
 * holds its tile.
 *
 * @param mission - The mission the scanner would join.
 * @param unit - The unit carrying it.
 * @param tile - Where it would be put.
 * @param range - Straight-line tiles from the unit it may be carried.
 * @param graph - Traversal structures for the map, built here when the caller has none.
 * @returns Nothing when the site is fine, else why not.
 */
export function validateRadarSite(
  mission: TacticalState,
  unit: Unit,
  tile: TileCoord,
  range: number,
  graph: MoveGraph = buildMoveGraph(mission.map),
): Result<void, TacticalError> {
  if (
    ![tile.x, tile.y, tile.z].every(Number.isInteger) ||
    !graph.index.inBounds(tile)
  ) {
    return err({ kind: "radar-tile-blocked" });
  }
  const distance = Math.hypot(tile.x - unit.pos.x, tile.z - unit.pos.z);
  if (distance > range || Math.abs(tile.y - unit.pos.y) > 1) {
    return err({ kind: "radar-out-of-reach", range });
  }
  const from = graph.index.getAt(unit.pos);
  const to = graph.index.getAt(tile);
  if (
    from === undefined ||
    to === undefined ||
    !withinSteps(graph, from, to, Math.ceil(range))
  ) {
    return err({ kind: "radar-tile-blocked" });
  }
  const key = graph.index.keyOf(tile);
  if (
    occupiedKeys(mission, graph.index).has(key) ||
    mission.spawners.some(
      (s) => !s.destroyed && s.hp > 0 && graph.index.keyOf(s.pos) === key,
    ) ||
    mission.radars.some((r) => graph.index.keyOf(r.pos) === key)
  ) {
    return err({ kind: "radar-tile-blocked" });
  }
  return ok(undefined);
}

/**
 * Puts a scanner with a full battery on `tile` for `unit`'s side and
 * announces it. The site is taken as already validated; the caller
 * bills the action and the use (#1132). Pure: draws one id.
 *
 * @param mission - The mission the scanner joins.
 * @param unit - The unit placing it.
 * @param tile - Where it goes.
 * @param tuning - Scan radius and battery.
 * @param ids - Issues the scanner's id.
 * @returns The mission with the scanner, and the `RadarDeployed` event.
 */
export function placeRadar(
  mission: TacticalState,
  unit: Unit,
  tile: TileCoord,
  tuning: RadarTuning,
  ids: IdGenerator,
): TacticalApplied<TacticalState> {
  const radar: Radar = {
    id: ids.nextId("radar"),
    team: unit.team,
    pos: { x: tile.x, y: tile.y, z: tile.z },
    range: tuning.scanRange,
    turnsLeft: tuning.batteryTurns,
  };
  return {
    state: { ...mission, radars: [...mission.radars, radar] },
    events: [{ type: RADAR_DEPLOYED, payload: { unitId: unit.id, radar } }],
  };
}

/**
 * True when an infantry walk of at most `steps` steps joins the two
 * tiles (#1130): the scanner is carried there on foot, so a wall the
 * squad would have to go three tiles round is a wall the scanner does
 * not cross. Occupied tiles do not block the walk — a comrade in the
 * way steps aside — but walls, doors and impassable ground do. A
 * breadth-first search over the move graph's own neighbour rule, so
 * placement and movement agree on what a step is.
 */
function withinSteps(
  graph: MoveGraph,
  from: Tile,
  to: Tile,
  steps: number,
): boolean {
  const goal = graph.index.keyOf(to);
  const seen = new Set<number>([graph.index.keyOf(from)]);
  let frontier: readonly Tile[] = [from];
  for (let depth = 0; depth < steps && frontier.length > 0; depth++) {
    const next: Tile[] = [];
    for (const tile of frontier) {
      for (const neighbour of graph.reachability.neighbours(
        tile,
        passMaskFor("infantry"),
      )) {
        const key = graph.index.keyOf(neighbour);
        if (key === goal) {
          return true;
        }
        if (!seen.has(key)) {
          seen.add(key);
          next.push(neighbour);
        }
      }
    }
    frontier = next;
  }
  return false;
}

// ===========================================
// Battery
// ===========================================

/**
 * Drains every scanner's battery by one turn as a **player** turn opens
 * (#1130), and announces the ones that just died. A phase step for
 * `createEndTurnHandler`, run after `refreshSides`; the bug phase
 * opening drains nothing, so a scanner deployed on turn T reports
 * through the player's turns T, T+1 and T+2 and the bug phases between
 * them, and is burnt out when turn T+3 opens.
 *
 * ```
 *   player phase opens ──► turnsLeft − 1 for every scanner still running
 *                              └─ reached 0 ──► RadarBurnedOut { radarId, pos }
 *   bugs phase opens   ──► unchanged
 * ```
 *
 * A dead scanner stays in `radars`: its model stays on the map and its
 * tile stays taken, it simply reports nothing (`radarContacts`).
 */
export const drainRadarBatteries: PhaseStep = (mission) => {
  if (mission.phase !== "player" || mission.radars.length === 0) {
    return { state: mission, events: [] };
  }
  const events: TacticalEvent[] = [];
  const radars = mission.radars.map((radar): Radar => {
    if (!radarIsActive(radar)) {
      return radar;
    }
    const drained: Radar = { ...radar, turnsLeft: radar.turnsLeft - 1 };
    if (!radarIsActive(drained)) {
      events.push({
        type: RADAR_BURNED_OUT,
        payload: { radarId: radar.id, pos: radar.pos },
      });
    }
    return drained;
  });
  return { state: { ...mission, radars }, events };
};

// ===========================================
// Contacts
// ===========================================

/**
 * Red location blips for living, unseen enemy units inside any friendly,
 * still-running scanner's horizontal circle. Scans cross walls and
 * floors, update from current positions, and never change sight,
 * explored terrain, targeting, or the other side's intel. A burnt-out
 * scanner (#1130) contributes nothing. A unit under the ground (#1179)
 * is not reported: the dish reads movement on the surface, and finding
 * burrowers is the seismic sensor's job (campaign arc §10.2).
 *
 * Nests are not reported here: since #1173 an open objective in the fog
 * is always marked (`objectiveMarkers`), so a radar square on top of it
 * would only duplicate the white diamond. `RadarContact.kind` keeps its
 * `"structure"` member for the day a structure that is not the
 * objective needs finding.
 */
export function radarContacts(
  mission: TacticalState,
  team: Team,
): readonly RadarContact[] {
  const radars = mission.radars.filter(
    (radar) => radar.team === team && radarIsActive(radar),
  );
  if (radars.length === 0) return [];
  const scanned = (pos: TileCoord): boolean =>
    radars.some(
      (radar) =>
        (pos.x - radar.pos.x) ** 2 + (pos.z - radar.pos.z) ** 2 <=
        radar.range ** 2,
    );
  const spotted = new Set(mission.vision[team].spotted);
  return mission.units
    .filter(
      (unit) =>
        unit.team !== team &&
        unit.hp > 0 &&
        !isBurrowed(unit) &&
        !spotted.has(unit.id) &&
        scanned(unit.pos),
    )
    .map((unit): RadarContact => ({ kind: "unit", pos: unit.pos }));
}
