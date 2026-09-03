/**
 * Balance knobs for the infestation simulation (GDD §5.3). Services
 * receive a tuning object rather than importing the defaults, so tests and
 * future difficulty settings can substitute their own values. Defaults
 * live in `overworld/data/infestation-tuning.ts`.
 *
 * ```
 *   growth = baseGrowthRate × (1 + threatFactor × threat / 100) − suppression
 *
 *   spread: city ≥ spreadThreshold, off cooldown
 *             ──► one least-infested neighbour += spreadAmount × hiveSpreadMultiplier?
 *             ──► cooldown[city] = spreadCooldownDays
 *
 *   seed:   P(clean city) = seedChance × threat / 100 × (1 − deterrence[region])
 *             ──► city = seedAmount
 * ```
 */
export interface InfestationTuning {
  /** Infestation points an infested city gains per day at zero threat. Positive. */
  readonly baseGrowthRate: number;
  /**
   * How strongly global threat accelerates growth: at 1, growth doubles
   * when threat is 100; at 0, threat has no effect. Non-negative.
   */
  readonly threatFactor: number;
  /**
   * Infestation at or above which a city spreads to a neighbour each day
   * it is off cooldown. Integer in the city infestation range.
   */
  readonly spreadThreshold: number;
  /** Infestation points a spread adds to the receiving city. Positive integer. */
  readonly spreadAmount: number;
  /**
   * Days a city waits after spreading before it may spread again. A
   * value of `n` lets a city spread every `n` days. Positive integer.
   */
  readonly spreadCooldownDays: number;
  /**
   * Probability in `[0, 1]` that a clean city is seeded on one day at
   * maximum threat with no deterrence. Scaled down linearly by threat
   * and by the region's deterrence.
   */
  readonly seedChance: number;
  /** Infestation a freshly seeded city starts at. Positive integer. */
  readonly seedAmount: number;
  /**
   * Multiplier on `spreadAmount` for cities in a region that hosts a bug
   * hive (GDD §5.3, M3). Hook point for #M3: nothing reads it until hives
   * exist, so it is `1` in the defaults. Positive.
   */
  readonly hiveSpreadMultiplier: number;
}
