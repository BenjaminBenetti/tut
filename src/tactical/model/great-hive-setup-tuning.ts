import type { BroodTuning } from "./brood-tuning";
import type { HiveAssaultSetupTuning } from "./hive-assault-setup-tuning";

// ===========================================
// Great Hive setup tuning
// ===========================================

/**
 * What a Great Hive assault stands in its cavern (campaign arc §6.9:
 * "Oversized Hive Assaults"): the Hive Assault setup with its own core,
 * guard and brood numbers. The level is `Mission.hive.level`, the levels
 * lost assaults have added. Defaults in
 * `tactical/data/great-hive-setup-tuning.ts`; the composition root
 * passes them through `MissionSetupDeps.greatHive`.
 *
 * ```
 *   core hp = assault.coreHp + level × assault.coreHpPerLevel
 *   guards  = clamp(⌊assault.baseGuards + level × assault.guardsPerLevel⌋, …)
 *   broods  = one per chamber, sized by `broods` rather than the ordinary
 *             brood tuning, so a cavern with twice the chambers does not
 *             hold twice the bugs
 * ```
 */
export interface GreatHiveSetupTuning {
  /** The core's hit points, the guards and the nest bounty, by level. */
  readonly assault: HiveAssaultSetupTuning;
  /** How the Great Hive cavern's dormant broods are sized and woken. */
  readonly broods: BroodTuning;
}
