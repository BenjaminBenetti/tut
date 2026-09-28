import type { DefenceTuning } from "../model/defence-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * The shipped defence tuning (#1179, GDD §5.4).
 *
 * - **Hold 8 turns after the last wave.** A defence used to read held
 *   only once the last wave was in and every bug on the map was dead,
 *   so a single bug the waves left boxed in a map-edge pocket, or stuck
 *   on the upper floor of a far building, kept it open to the turn cap
 *   (measured at forces 15/35: every capped defend-family run ended
 *   with 1–12 bugs alive, nearly all never seen and still for 20–56
 *   turns). The arc's objective is to hold a generator through every
 *   counted wave, so the hold ends once the last wave has had its go:
 *   eight bug phases, against a median of 6 and a 90th percentile of 12
 *   turns from the last wave landing to the last hit on a generator.
 *   Clearing the map still ends it sooner.
 */
export const DEFENCE_TUNING: DefenceTuning = {
  holdTurns: 8,
};
