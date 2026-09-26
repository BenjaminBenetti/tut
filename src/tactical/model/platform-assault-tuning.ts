// ===========================================
// Platform assault tuning
// ===========================================

/**
 * The Spore Platform's own numbers (campaign arc §6.9), one object so
 * the finale is retuned in one place (ADR 0003 §2.5). See
 * `PLATFORM_ASSAULT_TUNING` for the shipped values and why.
 *
 * ```
 *   hull   the pod beds' nests (spawn tuning), the edge waves, the hatch
 *   core   core hp = coreHp; one Hive Guard per guard post
 *          waves   = offer's mix × (1 − escortShare) + the boss's escort × escortShare
 * ```
 */
export interface PlatformAssaultTuning {
  /** The platform core's hit points. Positive. */
  readonly coreHp: number;
  /**
   * The share of the core stage's bugs drawn from the boss's escort, in
   * `[0, 1]` (arc §8: the finale's 15 of 100). Ignored when the core
   * stage stands no boss.
   */
  readonly escortShare: number;
}
