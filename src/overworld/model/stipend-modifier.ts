// ===========================================
// Stipend modifier
// ===========================================

/**
 * A pending scale on the daily stipend (GDD §5.5), created by an event
 * choice's `stipendMultiplier` effect. Every active modifier's factor
 * applies to each remaining payment; overlapping windows multiply.
 *
 * ```
 *   stipend paid = computeStipend × Π active.factor
 *   after paying: daysLeft − 1; dropped at 0
 * ```
 */
export interface StipendModifier {
  /** Multiplier on the day's stipend. Positive. */
  readonly factor: number;
  /** Payments this modifier still applies to. Positive integer. */
  readonly daysLeft: number;
}
