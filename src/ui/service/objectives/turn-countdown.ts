import type { ObjectiveCountdown } from "../../model/objective-presentation";
import { formatWhole } from "../format";

// ===========================================
// Constants
// ===========================================

/** Turns left, this one included, at which a countdown turns urgent and pulses. */
export const DEADLINE_URGENT_TURNS = 2;

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
 * The countdown to any deadline on `turn`: an objective's, or a sitrep's
 * (Dust-off Window's drop ship, campaign arc §11). Undefined once the
 * deadline turn has ended. One builder, so every countdown on the HUD
 * counts, words and pulses the same way.
 *
 * ```
 *   deadlineTurn 20, turn 18 ──► "… in 3 turns"               plain
 *                    turn 20 ──► "… at the end of this turn"   urgent
 *                    turn 21 ──► undefined
 * ```
 *
 * @param deadlineTurn - The last turn before it happens.
 * @param turn - The mission's current turn.
 * @param phrase - Subject and verb: "Pod matures", "Drop ship leaves".
 */
export function countdownAt(
  deadlineTurn: number,
  turn: number,
  phrase: string,
): ObjectiveCountdown | undefined {
  const turnsLeft = turnsUntilDeadline(deadlineTurn, turn);
  if (turnsLeft < 1) {
    return undefined;
  }
  return {
    text: countdownText(phrase, turnsLeft),
    turnsLeft,
    urgent: turnsLeft <= DEADLINE_URGENT_TURNS,
  };
}
