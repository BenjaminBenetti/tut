/**
 * What actually gets written to storage: the state plus the metadata the
 * loader needs before it can trust the state's shape.
 *
 * ```
 *   { schemaVersion, savedAt, state } ──JSON──► storage
 *                                   ◄──parse + migrate──
 * ```
 */
export interface SaveEnvelope<TState> {
  /** Schema version of `state`; migrations bring old envelopes forward. */
  readonly schemaVersion: number;
  /** ISO-8601 timestamp supplied by the caller (simulation has no clock). */
  readonly savedAt: string;
  readonly state: TState;
}
