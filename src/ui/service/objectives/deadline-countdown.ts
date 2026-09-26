import type {
  Objective,
  ObjectiveId,
  TacticalState,
} from "../../../tactical/model/tactical-state";
import type {
  ObjectiveCountdown,
  ObjectiveCountdowns,
  ObjectivePresentation,
  ObjectivePresentationCatalogue,
} from "../../model/objective-presentation";
import { formatWhole } from "../format";
import { OBJECTIVE_PRESENTATION } from "./objective-presentation";

// ===========================================
// Constants
// ===========================================

/** Turns left, this one included, at which a countdown turns urgent and pulses. */
export const DEADLINE_URGENT_TURNS = 2;

/** What a kind without its own `deadlinePhrase` says will happen. */
export const DEFAULT_DEADLINE_PHRASE = "Objective fails";

// ===========================================
// Countdown
// ===========================================

/**
 * Turns the player still has before a deadline passes, this one
 * included. The deadline step fails the objective once `deadlineTurn`
 * has ended, so on that very turn there is one left.
 *
 * ```
 *   deadlineTurn 8:  turn 1 ──► 8   turn 7 ──► 2   turn 8 ──► 1   turn 9 ──► 0
 * ```
 *
 * @param deadlineTurn - The last turn the objective can be completed on.
 * @param turn - The mission's current turn.
 */
export function turnsUntilDeadline(deadlineTurn: number, turn: number): number {
  return Math.max(0, deadlineTurn - turn + 1);
}

/**
 * The countdown's sentence: "Pod matures in 3 turns", and on the last
 * turn "Pod matures at the end of this turn", which is when it happens.
 *
 * @param phrase - Subject and verb: "Pod matures".
 * @param turnsLeft - From `turnsUntilDeadline`; one or more.
 */
export function countdownText(phrase: string, turnsLeft: number): string {
  return turnsLeft <= 1
    ? `${phrase} at the end of this turn`
    : `${phrase} in ${formatWhole(turnsLeft)} turns`;
}

/**
 * The objective's countdown on `turn`, or undefined when there is none
 * to show: no deadline, already complete or failed, or past it.
 *
 * @param objective - Any objective; only its flags and `deadlineTurn` are read.
 * @param turn - The mission's current turn.
 * @param phrase - Subject and verb, from the kind's presentation.
 */
export function deadlineCountdown(
  objective: Objective,
  turn: number,
  phrase: string,
): ObjectiveCountdown | undefined {
  if (
    objective.deadlineTurn === undefined ||
    objective.complete ||
    objective.failed === true
  ) {
    return undefined;
  }
  const turnsLeft = turnsUntilDeadline(objective.deadlineTurn, turn);
  if (turnsLeft < 1) {
    return undefined;
  }
  return {
    text: countdownText(phrase, turnsLeft),
    turnsLeft,
    urgent: turnsLeft <= DEADLINE_URGENT_TURNS,
  };
}

// ===========================================
// Mission queries
// ===========================================

/**
 * Every open objective's countdown, keyed by its id, each in its kind's
 * words. The HUD hands the result to the tracker, and the soonest to
 * the banner, so both show one reading.
 *
 * @param mission - The mission in progress.
 * @param presentations - How each kind is shown; the shipped table by default.
 */
export function objectiveCountdowns(
  mission: TacticalState,
  presentations: ObjectivePresentationCatalogue = OBJECTIVE_PRESENTATION,
): ObjectiveCountdowns {
  const countdowns = new Map<ObjectiveId, ObjectiveCountdown>();
  for (const objective of mission.objectives) {
    const presentation: ObjectivePresentation = presentations[objective.kind];
    const countdown = deadlineCountdown(
      objective,
      mission.turn,
      presentation.deadlinePhrase?.(objective) ?? DEFAULT_DEADLINE_PHRASE,
    );
    if (countdown !== undefined) {
      countdowns.set(objective.id, countdown);
    }
  }
  return countdowns;
}

/**
 * The countdown with the fewest turns left, the first in objective
 * order on a tie; undefined when nothing is counting down.
 *
 * @param countdowns - From `objectiveCountdowns`.
 */
export function soonestCountdown(
  countdowns: ObjectiveCountdowns,
): ObjectiveCountdown | undefined {
  let soonest: ObjectiveCountdown | undefined;
  for (const countdown of countdowns.values()) {
    if (soonest === undefined || countdown.turnsLeft < soonest.turnsLeft) {
      soonest = countdown;
    }
  }
  return soonest;
}

/**
 * The ids of what the objectives with an urgent countdown track (their
 * `trackedId`): the spore pod in its last turns. The scene swaps such a
 * target's ripe model in (#1179), from the same reading the tracker and
 * the banner pulse on.
 *
 * ```
 *   destroy-pod, deadline 8, turn 7 ──► { its pod's spawner id }
 *   destroy-pod, deadline 8, turn 5 ──► { }
 * ```
 *
 * @param mission - The mission in progress.
 * @param presentations - How each kind is shown; the shipped table by default.
 */
export function urgentDeadlineTargets(
  mission: TacticalState,
  presentations: ObjectivePresentationCatalogue = OBJECTIVE_PRESENTATION,
): ReadonlySet<string> {
  const countdowns = objectiveCountdowns(mission, presentations);
  const targets = new Set<string>();
  for (const objective of mission.objectives) {
    if (countdowns.get(objective.id)?.urgent !== true) {
      continue;
    }
    const presentation: ObjectivePresentation = presentations[objective.kind];
    const tracked = presentation.trackedId?.(objective);
    if (tracked !== undefined) {
      targets.add(tracked);
    }
  }
  return targets;
}
