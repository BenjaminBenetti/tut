// ===========================================
// Hive Assault setup tuning
// ===========================================

/**
 * What a Hive Assault stands in the cavern, by the hive's level
 * (campaign arc §6.5: "+1 every 7 days"). The level is the overworld's
 * `Mission.hive.level`; the map rule already sized the nest hooks by it,
 * so this is what the tactical setup scales on top. Defaults live in
 * `tactical/data/hive-assault-setup-tuning.ts`; the composition root
 * passes them through `MissionSetupDeps.hiveAssault`.
 *
 * ```
 *   core hp = coreHp + level × coreHpPerLevel
 *   guards  = clamp(⌊baseGuards + level × guardsPerLevel⌋, minGuards, maxGuards)
 *             (and never more than hiveGuardPositions finds)
 *   nest    = an egg spawner that hatches as a clearance's does, with no
 *             objective of its own: optional pressure, worth nestBounty
 *             tech points when wrecked
 * ```
 */
export interface HiveAssaultSetupTuning {
  /** Hive core hit points for a level-0 hive. Positive integer. */
  readonly coreHp: number;
  /** Extra core hit points per hive level. Non-negative integer. */
  readonly coreHpPerLevel: number;
  /** Hive Guards beside the core for a level-0 hive, before the clamp. */
  readonly baseGuards: number;
  /** Extra Hive Guards per hive level, before the floor and the clamp. Non-negative. */
  readonly guardsPerLevel: number;
  /** Fewest Hive Guards any hive has. Non-negative integer. */
  readonly minGuards: number;
  /** Most Hive Guards any hive has. At least `minGuards`. */
  readonly maxGuards: number;
  /** Tech points each chamber nest pays when wrecked. Non-negative integer. */
  readonly nestBounty: number;
  /**
   * When set, a guard the spaced pick cannot seat in full is topped up to
   * its whole count from the ring tiles left, shoulder to shoulder: the
   * Great Hive's packed guard, whose core chamber is crowded with hive
   * structures. Absent, only the two-guard floor is topped up.
   */
  readonly packGuards?: boolean;
}
