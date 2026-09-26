import { OBJECTIVE_UPDATED } from "../../model/objective-updated-event";
import type { ObjectiveRulesTable } from "../../model/objective-rules";
import type { PhaseStep } from "../../model/phase-step";
import type { TacticalEvent } from "../../model/tactical-event";
import type { Objective, TacticalState } from "../../model/tactical-state";
import { OBJECTIVE_RULES, objectiveRulesFor } from "./objective-rules";
import { objectiveComplete, objectiveFailed } from "./objective-status";

// ===========================================
// Deadline
// ===========================================

/**
 * True once the turn an objective's deadline names has ended: the
 * mission is on a later turn. An objective with no deadline never
 * passes one.
 *
 * ```
 *   deadlineTurn 8:  turn 8 player, turn 8 bugs ──► open
 *                    turn 9 player             ──► passed
 * ```
 *
 * @param objective - The objective to read.
 * @param turn - The mission's current turn.
 */
export function deadlinePassed(objective: Objective, turn: number): boolean {
  return objective.deadlineTurn !== undefined && turn > objective.deadlineTurn;
}

// ===========================================
// Phase step
// ===========================================

/**
 * The generic deadline rule (ADR 0013 §2.3): at every phase start, each
 * objective still open once its deadline turn has ended is marked
 * failed, announced through `ObjectiveUpdated`, and handed to its kind's
 * `onDeadline` for whatever the deadline sets off — a pod maturing into
 * a wave, a drop ship leaving.
 *
 * ```
 *   for each objective, in order:
 *     no deadline, or turn <= deadlineTurn        ──► untouched
 *     complete or failed already (live rules)     ──► untouched
 *     otherwise ──► failed: true, ObjectiveUpdated { complete: false, failed: true }
 *                   ──► rules[kind].onDeadline?(marked, mission, ctx)
 * ```
 *
 * "Open" is asked of the live rules, so a defence its own rule already
 * holds or has lost is not failed by the clock, and its `onDeadline`
 * never runs. The flag is sticky: a failed objective is skipped on
 * every later phase, so the consequences happen once.
 *
 * Registered right after `refreshSides`, ahead of anything else a phase
 * start does, so the deadline judges the mission as its last turn left
 * it: a charge that goes off or a fire that burns as the next turn opens
 * is already too late. Missing the step is not a mission end: a failed
 * objective turns a win into an extraction (`missionOutcome`).
 *
 * @param rules - The objective rules; the shipped table unless a test substitutes it.
 * @returns The step, for `EndTurn`'s list.
 */
export function createObjectiveDeadlineStep(
  rules: ObjectiveRulesTable = OBJECTIVE_RULES,
): PhaseStep {
  return (mission, ctx) => {
    let state: TacticalState = mission;
    const events: TacticalEvent[] = [];
    for (const { id } of mission.objectives) {
      // Read the objective as it stands now: an earlier objective's
      // consequences may have moved on the mission.
      const objective = state.objectives.find(
        (candidate) => candidate.id === id,
      );
      if (
        objective === undefined ||
        !deadlinePassed(objective, state.turn) ||
        objectiveComplete(state, objective, rules) ||
        objectiveFailed(state, objective, rules)
      ) {
        continue;
      }
      const marked: Objective = { ...objective, failed: true };
      state = {
        ...state,
        objectives: state.objectives.map((candidate) =>
          candidate.id === id ? marked : candidate,
        ),
      };
      events.push({
        type: OBJECTIVE_UPDATED,
        payload: { objectiveId: id, complete: false, failed: true },
      });
      const consequence = objectiveRulesFor(marked, rules).onDeadline?.(
        marked,
        state,
        ctx,
      );
      if (consequence !== undefined) {
        state = consequence.state;
        events.push(...consequence.events);
      }
    }
    return events.length === 0
      ? { state: mission, events: [] }
      : { state, events };
  };
}
