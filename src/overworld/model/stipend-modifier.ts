// ===========================================
// Stipend modifier
// ===========================================

/**
 * A pending scale on the daily stipend (GDD §5.5), created by an event
 * choice's `stipendMultiplier` effect or by a mission's consequence (an
 * evacuation, campaign arc §6.4). Every active modifier's factor applies
 * to each remaining payment; overlapping windows multiply.
 *
 * ```
 *   stipend paid = computeStipend × Π active.factor
 *   after paying: daysLeft − 1; dropped at 0
 *
 *   queued with a source    ──► replaces the active one of that source (refresh)
 *   queued without a source ──► appended (an event's windows stack)
 * ```
 */
export interface StipendModifier {
  /** Multiplier on the day's stipend. Positive. */
  readonly factor: number;
  /** Payments this modifier still applies to. Positive integer. */
  readonly daysLeft: number;
  /**
   * What granted it, for a modifier that refreshes rather than stacks
   * (`"evacuation-saved"`, `"evacuation-lost"`): at most one modifier of
   * a source is active, and a new one replaces it. Absent on an event's
   * modifiers and on every save written before the field existed.
   */
  readonly source?: string;
}
