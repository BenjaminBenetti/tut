/**
 * Failure value returned when a spend would take credits below zero.
 * Plain data so it can sit inside a `Result`, be logged, or be shown in
 * the UI; the discriminator lets callers fold it into wider error unions.
 */
export interface InsufficientCreditsError {
  readonly type: "insufficient-credits";
  /** Credits the spend asked for. */
  readonly required: number;
  /** Credits actually available at the time. */
  readonly available: number;
}
