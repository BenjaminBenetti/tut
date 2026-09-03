/**
 * Balance knobs for non-combat event generation (GDD §5.4). Services
 * receive a tuning object rather than importing the defaults, so tests
 * and future difficulty settings can substitute their own values.
 * Defaults live in `overworld/data/event-tuning.ts`.
 *
 * ```
 *   each day with no pending event:
 *     chance(dailyEventChance) ──► pickWeighted(eligible types) ──► PendingEvent
 *                                                                    expires day + expiryDays
 * ```
 */
export interface EventTuning {
  /** Probability in `[0, 1]` that a day with no pending event offers one. */
  readonly dailyEventChance: number;
  /** Days the player has to answer before the default choice is applied. Positive integer. */
  readonly expiryDays: number;
}
