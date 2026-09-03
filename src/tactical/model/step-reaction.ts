import type { TacticalApplied } from "./tactical-event";
import type { TacticalContext } from "./tactical-handler";
import type { TacticalState } from "./tactical-state";
import type { UnitId } from "./unit";

// ===========================================
// Step reaction
// ===========================================

/**
 * What the other side does the moment a unit lands on a tile: the move
 * handler calls it after every step with the mission as it then stands,
 * and folds the result in before taking the next step. Overwatch (#328)
 * is one; the move handler itself knows nothing about shooting.
 *
 * ```
 *   step ──► UnitMoved ──► react(mission, moverId, ctx) ──► { state, events }
 *                                                             │
 *                              mover still standing? ──yes──► next step
 *                                                     └─no──► walk ends here
 * ```
 */
export type StepReaction = (
  mission: TacticalState,
  movedUnitId: UnitId,
  ctx: TacticalContext,
) => TacticalApplied<TacticalState>;

/** The reaction that never reacts, for moves that nothing watches. */
export const NO_REACTION: StepReaction = (mission) => ({
  state: mission,
  events: [],
});
