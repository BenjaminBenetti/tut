import type { Direction } from "../../core/model/direction";
import { DIRECTIONS } from "../../core/model/direction";
import { err, ok } from "../../core/model/result";
import { stepGridPos } from "../../core/service/grid-math";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { MoveCommand } from "../model/move-command";
import type { StepReaction } from "../model/step-reaction";
import { NO_REACTION } from "../model/step-reaction";
import type { MoveRejection } from "../model/tactical-error";
import type { TacticalEvent } from "../model/tactical-event";
import type {
  TacticalHandler,
  TacticalOutcome,
} from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import { PHASE_FOR_TEAM } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { passMaskFor } from "../model/unit";
import { UNIT_MOVED } from "../model/unit-moved-event";
import {
  apCostOf,
  buildMoveGraph,
  moveBudget,
  searchMoves,
} from "./movement-service";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `Move` handler (#325): walks the unit along the command's
 * path one step at a time, letting `react` answer each step (overwatch,
 * #328) and ending the walk early if the mover goes down; spends
 * `ceil(steps taken / move)` action points and turns the unit to face
 * its last step. Emits one `UnitMoved` per step, with any reaction's
 * events after the step that provoked them. Pure and deterministic.
 *
 * ```
 *   unit missing ─────────────────────► err unit-not-found
 *   unit down / not its side's phase ──► err illegal-move (unit-down | wrong-phase)
 *   path empty / longer than budget ───► err illegal-move (empty-path | over-budget)
 *   a tile not in reachable(unit) ─────► err illegal-move (unreachable)
 *   two consecutive tiles not a step ──► err illegal-move (not-a-step)
 *   otherwise, per step ───────────────► UnitMoved, react(...), stop if the mover is down
 * ```
 */
export function createMoveHandler(
  react: StepReaction = NO_REACTION,
): TacticalHandler<MoveCommand> {
  return (mission, command, ctx) => {
    const { unitId, path } = command.payload;
    const unit = findUnit(mission, unitId);
    if (unit === undefined) {
      return err({ kind: "unit-not-found", unitId });
    }
    const reject = (reason: MoveRejection): TacticalOutcome =>
      err({ kind: "illegal-move", unitId, reason });
    if (unit.hp <= 0) {
      return reject("unit-down");
    }
    if (PHASE_FOR_TEAM[unit.team] !== mission.phase) {
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

    let state = mission;
    const events: TacticalEvent[] = [];
    let from: TileCoord = unit.pos;
    let taken = 0;
    for (const step of steps) {
      const to: TileCoord = { x: step.x, y: step.y, z: step.z };
      state = placeUnit(state, unitId, to, directionBetween(from, to));
      events.push({
        type: UNIT_MOVED,
        payload: { unitId, from, to, path: [to] },
      });
      from = to;
      taken += 1;
      const reaction = react(state, unitId, ctx);
      state = reaction.state;
      events.push(...reaction.events);
      if ((findUnit(state, unitId)?.hp ?? 0) <= 0) {
        break;
      }
    }
    const apCost = apCostOf(mission, unit, taken);
    state = {
      ...state,
      units: state.units.map((candidate) =>
        candidate.id === unitId
          ? { ...candidate, ap: Math.max(0, candidate.ap - apCost) }
          : candidate,
      ),
    };
    return ok({ state, events });
  };
}

// ===========================================
// Helpers
// ===========================================

/** The unit with the id, if it is in the mission. */
function findUnit(mission: TacticalState, unitId: UnitId): Unit | undefined {
  return mission.units.find((unit) => unit.id === unitId);
}

/** Puts the unit on the tile, turning it to face the step when that step had a horizontal direction. */
function placeUnit(
  mission: TacticalState,
  unitId: UnitId,
  pos: TileCoord,
  facing: Direction | undefined,
): TacticalState {
  return {
    ...mission,
    units: mission.units.map((unit) =>
      unit.id === unitId
        ? { ...unit, pos, facing: facing ?? unit.facing }
        : unit,
    ),
  };
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
