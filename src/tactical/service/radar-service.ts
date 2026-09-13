import { err, ok } from "../../core/model/result";
import type { Result } from "../../core/model/result";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { DeployRadarCommand } from "../model/deploy-radar-command";
import type { Radar, RadarContact, RadarTuning } from "../model/radar";
import { radarIsActive } from "../model/radar";
import { RADAR_BURNED_OUT } from "../model/radar-burned-out-event";
import { RADAR_DEPLOYED } from "../model/radar-deployed-event";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Team, Unit, UnitId } from "../model/unit";
import { passMaskFor } from "../model/unit";
import { actingUnit } from "./acting-unit";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph, occupiedKeys } from "./movement-service";
import type { PhaseStep } from "./turn-service";

// ===========================================
// Deployment
// ===========================================

/** Whether this unit's frozen template grants the radar action. */
export function carriesRadar(mission: TacticalState, unit: Unit): boolean {
  return (
    unit.kind === "squad" &&
    unit.team === "tdf" &&
    (mission.templates[unit.templateId]?.abilities ?? []).includes(
      "deploy-radar",
    )
  );
}

/**
 * Shared wheel/command validation: a free, reachable surface within the
 * tuning's straight-line deploy range on the ground plane and at most a
 * layer up or down. Range 2 since #1130, so a diagonal neighbour (which
 * measures 1.41) is legal; a burnt-out scanner still holds its tile.
 */
export function validateRadarDeployment(
  mission: TacticalState,
  unitId: UnitId,
  tile: TileCoord,
  tuning: RadarTuning,
  graph: MoveGraph = buildMoveGraph(mission.map),
): Result<Unit, TacticalError> {
  if (mission.outcome !== undefined) {
    return err({ kind: "mission-over", outcome: mission.outcome });
  }
  const acting = actingUnit(mission, unitId, tuning.apCost);
  if (!acting.ok) return acting;
  const unit = acting.value;
  if (!carriesRadar(mission, unit)) {
    return err({ kind: "no-radar", unitId });
  }
  if (
    ![tile.x, tile.y, tile.z].every(Number.isInteger) ||
    !graph.index.inBounds(tile)
  ) {
    return err({ kind: "radar-tile-blocked" });
  }
  const distance = Math.hypot(tile.x - unit.pos.x, tile.z - unit.pos.z);
  if (distance > tuning.deployRange || Math.abs(tile.y - unit.pos.y) > 1) {
    return err({ kind: "radar-out-of-reach", range: tuning.deployRange });
  }
  const from = graph.index.getAt(unit.pos);
  const to = graph.index.getAt(tile);
  if (
    from === undefined ||
    to === undefined ||
    !withinSteps(graph, from, to, Math.ceil(tuning.deployRange))
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
  return ok(unit);
}

/** Places a scanner with a full battery and spends AP only after all validation succeeds. */
export function createDeployRadarHandler(
  tuning: RadarTuning,
): TacticalHandler<DeployRadarCommand> {
  return (mission, command, ctx) => {
    const { unitId, tile } = command.payload;
    const validated = validateRadarDeployment(mission, unitId, tile, tuning);
    if (!validated.ok) return validated;
    const radar: Radar = {
      id: ctx.ids.nextId("radar"),
      team: validated.value.team,
      pos: { ...tile },
      range: tuning.scanRange,
      turnsLeft: tuning.batteryTurns,
    };
    return ok({
      state: {
        ...mission,
        radars: [...mission.radars, radar],
        units: mission.units.map((unit) =>
          unit.id === unitId ? { ...unit, ap: unit.ap - tuning.apCost } : unit,
        ),
      },
      events: [{ type: RADAR_DEPLOYED, payload: { unitId, radar } }],
    });
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
 * Red location blips for living, unseen enemies inside any friendly,
 * still-running scanner's horizontal circle. Scans cross walls and
 * floors, update from current positions, and never change sight,
 * explored terrain, targeting, or the other side's intel. A burnt-out
 * scanner (#1130) contributes nothing.
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
  const contacts: RadarContact[] = mission.units
    .filter(
      (unit) =>
        unit.team !== team &&
        unit.hp > 0 &&
        !spotted.has(unit.id) &&
        scanned(unit.pos),
    )
    .map((unit) => ({ kind: "unit", pos: unit.pos }));
  if (team === "tdf") {
    const index = new TileIndex(mission.map);
    const visible = new Set(mission.vision[team].visible);
    contacts.push(
      ...mission.spawners
        .filter(
          (s) =>
            !s.destroyed &&
            s.hp > 0 &&
            !visible.has(index.keyOf(s.pos)) &&
            scanned(s.pos),
        )
        .map((s): RadarContact => ({ kind: "structure", pos: s.pos })),
    );
  }
  return contacts;
}
