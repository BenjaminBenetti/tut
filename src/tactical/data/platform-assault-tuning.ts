import type { PlatformAssaultTuning } from "../model/platform-assault-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Shipped Spore Platform numbers (#1179), placeholders for the finale's
 * calibration (arc §12, D5: a basic finale force should win about 55 %):
 *
 * - **Core: 200 hit points** behind the `platform-core` variant's 2
 *   armour. Four finale mechs with every gun on it (a heavy autocannon's
 *   26 at pen 3, a thermal lance's 38 at pen 8, hitting 70 % of the
 *   time) take it in two or three turns once they stand within range;
 *   with half the squad holding off the Sovereign and the guards, four
 *   or five. Twenty planted charges' worth, so infantry can finish it
 *   but cannot rush it. The Hive Assault's largest core is 150.
 * - **Escort share: 0.15**, the finale's 15 that the bestiary leaves out
 *   of its 85 rolled (arc §8, footnote): of the core's hatchlings and
 *   duct waves, 15 in 100 are the Sovereign's escort species.
 */
export const PLATFORM_ASSAULT_TUNING: PlatformAssaultTuning = {
  coreHp: 200,
  escortShare: 0.15,
};
