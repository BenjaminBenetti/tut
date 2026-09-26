/**
 * Balance knobs for the infestation simulation (GDD §5.3). Services
 * receive a tuning object rather than importing the defaults, so tests and
 * future difficulty settings can substitute their own values. Defaults
 * live in `overworld/data/infestation-tuning.ts`.
 *
 * ```
 *   growth = baseGrowthRate × (1 + threatFactor × threat / 100) × growthFactor[city]
 *
 *   spread: city ≥ spreadThreshold, off cooldown
 *             ──► one least-infested neighbour += spreadAmount
 *                                                   (× hiveSpreadMultiplier in a hive region)
 *             ──► cooldown[city] = spreadCooldownDays
 *
 *   seed:   P(clean city) = seedChance × threat / 100 × (1 − deterrence[region])
 *             ──► city = seedAmount, undetected
 *
 *   detect: infested, undetected city becomes detected when
 *             region mean ≥ regionDetectionThreshold × detectionFactor[region]
 *             or city    ≥ cityDetectionThreshold   × detectionFactor[region]
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
   * hive (GDD §5.3, campaign arc §6.5). The spread service rounds the
   * product to a whole point (`spreadAmountFrom`). Positive.
   */
  readonly hiveSpreadMultiplier: number;
  /**
   * Mean infestation of a region at or above which every infested city
   * in it is detected (GDD §5.3): the baseline "the region has built up"
   * signal. Sensor arrays scale it down. Positive, in the infestation
   * range.
   */
  readonly regionDetectionThreshold: number;
  /**
   * Infestation at or above which a city is detected on its own, before
   * its region builds up. Above `regionDetectionThreshold`, so a lone
   * foothold is found later than one among infested neighbours. Sensor
   * arrays scale it down. Positive, in the infestation range.
   */
  readonly cityDetectionThreshold: number;
}
