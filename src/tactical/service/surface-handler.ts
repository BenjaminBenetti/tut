import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { ok } from "../../core/model/result";
import { stepGridPos } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { BurrowTuning } from "../model/burrow-tuning";
import type { StepReaction } from "../model/step-reaction";
import { NO_REACTION } from "../model/step-reaction";
import type { SurfaceCommand } from "../model/surface-command";
import type { TacticalEvent } from "../model/tactical-event";
import type { TacticalHandler } from "../model/tactical-handler";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { UNIT_SURFACED } from "../model/unit-surfaced-event";
import { enemiesBeside, validateSurface } from "./burrow-service";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `Surface` handler (#1179): the burrower comes up on the
 * tile above it for `tuning.surfaceApCost`, turned to face the first
 * enemy beside it, and remembers the turn so its cooldown can run.
 * Whatever action points are left it may still spend, so one that lay
 * in wait beside a squad surfaces and bites in the same phase.
 *
 * Coming up is a step onto the surface, so `react` answers it exactly
 * as it answers a step of a walk: the shipped chain burns it if it came
 * up in fire and then lets every watcher fire at it (overwatch). That
 * is the counter to an ambush the squad cannot see coming — keep
 * someone on watch — and the reaction's events follow the surfacing in
 * the batch, so the shot plays after the burrower rises. Pure; draws
 * only what `react` draws.
 *
 * ```
 *   validateSurface refuses ──► err (as it says)
 *   otherwise ──► status − burrowed, ap − cost, surfacedOnTurn = turn,
 *                 UnitSurfaced { pos, beside }, react(mission, unitId)
 * ```
 *
 * @param tuning - What coming up costs.
 * @param react - What the surface does about it; nothing by default.
 */
export function createSurfaceHandler(
  tuning: BurrowTuning,
  react: StepReaction = NO_REACTION,
): TacticalHandler<SurfaceCommand> {
  return (mission, command, ctx) => {
    const { unitId } = command.payload;
    const checked = validateSurface(
      mission,
      unitId,
      tuning,
      new TileIndex(mission.map),
    );
    if (!checked.ok) {
      return checked;
    }
    const { unit, tile } = checked.value;
    const pos: TileCoord = { x: tile.x, y: tile.y, z: tile.z };
    const beside = enemiesBeside(mission, unit, pos);
    const up: Unit = {
      ...unit,
      pos,
      status: unit.status.filter((status) => status !== "burrowed"),
      ap: Math.max(0, unit.ap - tuning.surfaceApCost),
      surfacedOnTurn: mission.turn,
      facing: facingToward(mission, pos, beside) ?? unit.facing,
    };
    const surfaced: TacticalState = {
      ...mission,
      units: mission.units.map((candidate) =>
        candidate.id === unitId ? up : candidate,
      ),
    };
    const events: TacticalEvent[] = [
      { type: UNIT_SURFACED, payload: { unitId, pos, beside } },
    ];
    const reaction = react(surfaced, unitId, ctx);
    return ok({
      state: reaction.state,
      events: [...events, ...reaction.events],
    });
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The direction from `pos` toward the first of `beside` standing on a
 * horizontally adjacent tile, or undefined when none does.
 */
function facingToward(
  mission: TacticalState,
  pos: TileCoord,
  beside: readonly UnitId[],
): Direction | undefined {
  for (const id of beside) {
    const other = mission.units.find((unit) => unit.id === id);
    if (other === undefined) {
      continue;
    }
    const direction = DIRECTIONS.find((candidate) => {
      const stepped = stepGridPos(pos, candidate);
      return stepped.x === other.pos.x && stepped.z === other.pos.z;
    });
    if (direction !== undefined) {
      return direction;
    }
  }
  return undefined;
}
