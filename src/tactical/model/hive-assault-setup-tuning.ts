// ===========================================
// Hive Assault setup tuning
// ===========================================

/** A chamber nest's pace against a clearance's nest at the same difficulty. */
export interface NestPace {
  /** Bugs a nest hatches beyond the spawn tuning's `hatchCount` (negative for fewer). */
  readonly hatchBonus: number;
  /** Bug phases a nest waits beyond the spawn tuning's interval. Non-negative integer. */
  readonly hatchDelay: number;
}

/**
 * The chamber nests' pace from one difficulty up (#1179 C3a round 2): a
 * later step replaces an earlier one, and below the first step the
 * tuning's `nestHatchBonus` and `nestHatchDelay` hold.
 *
 * ```
 *   difficulty  ──────┬──────────────┬──────────────►
 *   pace        base  │ step 1       │ step 2
 *                     fromDifficulty fromDifficulty
 * ```
 */
export interface NestPaceStep extends NestPace {
  /** The least offer difficulty the step applies at. Integer. */
  readonly fromDifficulty: number;
}

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
 *   nest    = an egg spawner with no objective of its own: optional
 *             pressure, worth nestBounty tech points when wrecked. It
 *             hatches the spawn tuning's count + nestHatchBonus bugs every
 *             hatch interval + nestHatchDelay bug phases, unless a step
 *             of nestPaceByDifficulty reaches the offer's difficulty
 *   waves   = edgeWaves edge waves out of the burrows, then none
 *             (absent: the spawn tuning's endless schedule)
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
  /**
   * Bugs a chamber nest hatches beyond the spawn tuning's `hatchCount`
   * (negative for fewer). Absent reads as 0: a clearance's nest.
   */
  readonly nestHatchBonus?: number;
  /**
   * Bug phases a chamber nest waits beyond the spawn tuning's interval
   * for the difficulty, before its first hatch and between hatches.
   * Non-negative integer; absent reads as 0.
   */
  readonly nestHatchDelay?: number;
  /**
   * The nests' pace by difficulty, steps in rising `fromDifficulty`: the
   * last step at or below the offer's difficulty sets the hatch bonus and
   * delay in place of `nestHatchBonus` and `nestHatchDelay`. Absent or
   * empty, those two hold at every difficulty.
   */
  readonly nestPaceByDifficulty?: readonly NestPaceStep[];
  /**
   * Edge waves the burrows send before they fall quiet (the edge
   * schedule's `totalWaves`). Non-negative integer; absent, the waves
   * never stop.
   */
  readonly edgeWaves?: number;
}
