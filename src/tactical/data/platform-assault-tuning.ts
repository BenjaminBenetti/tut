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
 * - **Two wall nests of the chamber's four, three guards on its four
 *   posts** (calibrated on the filled finale force,
 *   `docs/design/calibration/C3b-story.md`). With every pod a nest the
 *   hatchlings never stopped: a new player, who shoots whatever is
 *   nearest and never a nest, was still trading shots at the turn cap
 *   in 14 of 16 assaults and won 2. Two nests leave gaps in the stream
 *   for the squad to reach the core; the empty post opens one flank.
 *   The new player wins 20 of 32 (arc D5's 55 %, at 16 seeds 10), the
 *   expert all 32.
 *
 * ```
 *   core chamber   wall pods  ● ● ○ ○   (● a nest, ○ dormant dressing)
 *                  posts      G G G ·   (either side of the dais)
 * ```
 */
export const PLATFORM_ASSAULT_TUNING: PlatformAssaultTuning = {
  coreHp: 200,
  escortShare: 0.15,
  wallNests: 2,
  guards: 3,
};
