/**
 * Balance knobs for the infestation simulation (GDD §5.3). Services
 * receive a tuning object rather than importing the defaults, so tests and
 * future difficulty settings can substitute their own values. Defaults
 * live in `overworld/data/infestation-tuning.ts`.
 *
 * ```
 *   growth = baseGrowthRate × (1 + threatFactor × threat / 100) − suppression
 * ```
 *
 * Spread and seeding knobs (#58) join this interface when they land.
 */
export interface InfestationTuning {
  /** Infestation points an infested city gains per day at zero threat. Positive. */
  readonly baseGrowthRate: number;
  /**
   * How strongly global threat accelerates growth: at 1, growth doubles
   * when threat is 100; at 0, threat has no effect. Non-negative.
   */
  readonly threatFactor: number;
}
