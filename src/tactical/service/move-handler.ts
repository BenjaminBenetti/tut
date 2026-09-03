import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { err, ok } from "../../core/model/result";
import { stepGridPos } from "../../core/service/grid-math";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MoveCommand } from "../model/move-command";
import type { MoveRejection } from "../model/tactical-error";
import type {
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalPhase } from "../model/tactical-state";
import type { Team, Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type { UnitMovedEvent } from "../model/unit-moved-event";
import { UNIT_MOVED } from "../model/unit-moved-event";
import {
  apCostOf,
  buildMoveGraph,
  moveBudget,
  searchMoves,
} from "./movement-service";

// ===========================================
// Constants
// ===========================================

/** The phase each team acts in (GDD §6.2). */
const PHASE_OF_TEAM: Readonly<Record<Team, TacticalPhase>> = {
  tdf: "player",
  bugs: "bugs",
};

// ===========================================
// Handler
// ===========================================

/**
 * Applies a `Move` (#325): walks the unit along the command's path,
 * spends `ceil(steps / move)` action points, turns it to face its last
 * step and emits one `UnitMoved` per step so overwatch can later
 * interrupt between steps and the animation can play them in order.
 * Pure and deterministic; draws nothing from the context.
 *
 * ```
 *   unit missing ─────────────────────► err unit-not-found
 *   unit down / not its side's phase ──► err illegal-move (unit-down | wrong-phase)
 *   path empty / longer than budget ───► err illegal-move (empty-path | over-budget)
 *   a tile not in reachable(unit) ─────► err illegal-move (unreachable)
 *   two consecutive tiles not a step ──► err illegal-move (not-a-step)
 *   otherwise ─────────────────────────► ok { units[unit] moved, UnitMoved × steps }
 * ```
 */
export const moveHandler: TacticalHandler<MoveCommand> = (mission, command) => {
  const { unitId, path } = command.payload;
  const unit = mission.units.find((candidate) => candidate.id === unitId);
  if (unit === undefined) {
    return err({ kind: "unit-not-found", unitId });
  }
  const reject = (reason: MoveRejection): TacticalOutcome =>
    err({ kind: "illegal-move", unitId, reason });
  if (unit.hp <= 0) {
    return reject("unit-down");
  }
  if (PHASE_OF_TEAM[unit.team] !== mission.phase) {
    return reject("wrong-phase");
  }
  if (path.length === 0) {
    return reject("empty-path");
  }
  if (path.length > moveBudget(mission, unit)) {
    return reject("over-budget");
  }

  const graph = buildMoveGraph(mission.map);
  const search = searchMoves(mission, unit, graph);
  const unitClass = passMaskFor(unit.passClass);
  let previous = graph.index.getAt(unit.pos);
  const steps: Tile[] = [];
  for (const coord of path) {
    const tile = graph.index.inBounds(coord)
      ? graph.index.getAt(coord)
      : undefined;
    if (tile === undefined || !search.costs.has(graph.index.keyOf(tile))) {
      return reject("unreachable");
    }
    if (
      previous === undefined ||
      !graph.reachability.canStep(previous, tile, unitClass)
    ) {
      return reject("not-a-step");
    }
    steps.push(tile);
    previous = tile;
  }

  const events = stepEvents(unit, steps);
  const last = steps[steps.length - 1] ?? unit.pos;
  const before = steps[steps.length - 2] ?? unit.pos;
  const moved: Unit = {
    ...unit,
    pos: { x: last.x, y: last.y, z: last.z },
    ap: unit.ap - apCostOf(mission, unit, steps.length),
    facing: directionBetween(before, last) ?? unit.facing,
  };
  return ok({
    state: {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unit.id ? moved : candidate,
      ),
    },
    events,
  });
};

// ===========================================
// Helpers
// ===========================================

/** One `UnitMoved` per step, each carrying the tile it lands on. */
function stepEvents(unit: Unit, steps: readonly Tile[]): UnitMovedEvent[] {
  const events: UnitMovedEvent[] = [];
  let from: TileCoord = unit.pos;
  for (const step of steps) {
    const to: TileCoord = { x: step.x, y: step.y, z: step.z };
    events.push({
      type: UNIT_MOVED,
      payload: { unitId: unit.id, from, to, path: [to] },
    });
    from = to;
  }
  return events;
}

/**
 * The direction from one tile to a horizontally adjacent one, ignoring
 * level (a connector's ends are horizontal neighbours), or `undefined`.
 */
function directionBetween(
  from: TileCoord,
  to: TileCoord,
): Direction | undefined {
  return DIRECTIONS.find((direction) => {
    const stepped = stepGridPos(from, direction);
    return stepped.x === to.x && stepped.z === to.z;
  });
}
