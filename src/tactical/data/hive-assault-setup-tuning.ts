import type { HiveAssaultSetupTuning } from "../model/hive-assault-setup-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * The shipped Hive Assault setup (campaign arc §6.5).
 *
 * ```
 *   level      0    1    2    3    4    6
 *   core hp   60   75   90  105  120  150    six to twelve charges
 *   guards     2    2    3    3    4    4
 * ```
 *
 * A core at level 0 takes six planted charges (10 each), a spore pod's
 * worth and a half; its one point of armour trims every rifle hit. The
 * nests pay 5 tech points each, a sixth of a level-0 assault's award.
 */
export const HIVE_ASSAULT_SETUP_TUNING: HiveAssaultSetupTuning = {
  coreHp: 60,
  coreHpPerLevel: 15,
  baseGuards: 2,
  guardsPerLevel: 0.5,
  minGuards: 2,
  maxGuards: 4,
  nestBounty: 5,
};
