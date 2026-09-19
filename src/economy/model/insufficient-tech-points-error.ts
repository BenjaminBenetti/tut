/**
 * Failure value returned when a tech spend would take the pool below
 * zero. Plain data so it can sit inside a `Result` and be folded into
 * wider error unions, like its credit twin.
 */
export interface InsufficientTechPointsError {
  readonly type: "insufficient-tech-points";
  /** Tech points the spend asked for. */
  readonly required: number;
  /** Tech points actually available at the time. */
  readonly available: number;
}
