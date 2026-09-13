import { formatWhole } from "./format";

// ===========================================
// Charge delay text
// ===========================================

/**
 * When a placed charge goes off, in the player's words, shared by the
 * action wheel, the unit card and the event log so the three agree and
 * none carries the number as a literal (#1134): the delay is the
 * definition's, and it changed once already.
 *
 * ```
 *   1 ──► "next turn"      2 ──► "in 2 turns"
 * ```
 *
 * @param delayTurns - Turns the charge waits after the one it was placed on.
 * @returns The phrase, without a leading separator.
 */
export function chargeDelayText(delayTurns: number): string {
  return delayTurns === 1 ? "next turn" : `in ${formatWhole(delayTurns)} turns`;
}
