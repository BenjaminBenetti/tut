/**
 * Weights that turn a stat sheet into one `combatRating` scalar. Services
 * receive a tuning object rather than importing the defaults, so tests
 * and future difficulty settings can substitute their own. Defaults live
 * in `roster/data/mech-rating-tuning.ts`.
 *
 * ```
 *   rating = max( 0, round( armor × armorWeight
 *                         + mobility × mobilityWeight
 *                         + accuracy × accuracyWeight
 *                         + firepower × firepowerWeight
 *                         − max(0, heat) × heatPenalty ) )
 * ```
 */
export interface MechRatingTuning {
  /** Rating per point of armor. */
  readonly armorWeight: number;
  /** Rating per tile of mobility. */
  readonly mobilityWeight: number;
  /** Rating per percentage point of accuracy. */
  readonly accuracyWeight: number;
  /** Rating per point of firepower. */
  readonly firepowerWeight: number;
  /** Rating lost per point of net positive heat; dissipating mechs pay nothing. */
  readonly heatPenalty: number;
}
