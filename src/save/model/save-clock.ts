/**
 * Supplies the timestamp stamped on save envelopes. The app passes the
 * wall clock; tests pass a constant. Nothing under `save/` reads `Date`
 * itself (ADR 0003 §2.3), so every timestamp is injected and replayable.
 */
export interface SaveClock {
  /** The current time as an ISO-8601 string. */
  now(): string;
}
