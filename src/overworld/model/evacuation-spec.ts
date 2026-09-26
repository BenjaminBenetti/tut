// ===========================================
// Evacuation spec
// ===========================================

/**
 * What an Evacuation offer carries (campaign arc §6.4, ADR 0013 §2.2):
 * how many civilian groups are trapped in the city and what each one
 * brought home pays on top of the offer's credits. The map rule asks for
 * one civilian hook per group, the briefing says "Free N civilian
 * groups", and the consequence rule pays the per-group extra.
 *
 * ```
 *   offer made   ──► groups (3–5, by difficulty) + creditsPerGroup  (the offer rule)
 *   map          ──► one civilian hook per group                   (the map rule)
 *   resolved     ──► creditsPerGroup × civiliansRescued, any outcome (the consequence rule)
 * ```
 *
 * Frozen when the offer is made; plain serializable data. Optional on
 * `Mission`, so no save needs a migration.
 */
export interface EvacuationSpec {
  /** Civilian groups trapped in the city; one civilian hook each. Positive integer. */
  readonly groups: number;
  /** Credits each group walked aboard pays on top of the offer's credits. */
  readonly creditsPerGroup: number;
}
