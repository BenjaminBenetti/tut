// ===========================================
// Prey tuning
// ===========================================

/**
 * How much the swarm prefers one kind of target over another when it
 * could bite either (campaign arc §6.4). A weight multiplies the
 * expected value of an attack only when attacks are ranked; it never
 * changes what the attack is worth (`AttackOption.value`), so a sure
 * kill on a squad can still outrank a scratch on a civilian group.
 *
 * ```
 *   rank = value × civilianWeight   for a civilian group
 *   rank = value                    for anything else, a squad carrying
 *                                   a specimen (#1179) included
 * ```
 */
export interface PreyTuning {
  /**
   * The multiplier on a civilian group's attack value. Above 1 so that,
   * of two equal bites, the bugs take the one on people who cannot shoot
   * back; small enough that a clearly better bite on a fighter still
   * comes first.
   */
  readonly civilianWeight: number;
}
