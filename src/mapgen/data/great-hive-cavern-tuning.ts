import type { HiveCavernTuning } from "../model/hive-cavern-tuning";
import { HIVE_CAVERN_TUNING } from "./hive-cavern-tuning";

// ===========================================
// Great Hive cavern tuning
// ===========================================

/**
 * A Great Hive cavern's shape (campaign arc §6.9: "Oversized Hive
 * Assaults"): the hive cavern's tuning with more chambers and a bigger
 * core. Everything not listed is the hive cavern's.
 *
 * ```
 *                      hive cavern     Great Hive
 *   chambers           5–8             8–9
 *   side chambers      1–3             2–4
 *   route at least     4               5
 *   core radius        12–14           14–16
 *   burrows            2–3             3–4
 *   hives by the core  3–5             5–7
 * ```
 *
 * On the 152-deep board a route of 7 (the mouth, five route chambers
 * and the core) fits at the smallest radii with 13 tiles to spare, and
 * 9 chambers less at least 2 side chambers never make a longer one. The
 * route was 9–11 chambers on a 184-deep board until #1179 C3a round 3
 * shortened the walk; a route of 8 or 9 does not fit 152.
 *
 * A Great Hive also has a forward extraction point (#1179 C3a round 3):
 * a 4 × 4 square, the landing zone's size, in the route chamber where
 * a mech's walk to the core is three-eighths of the landing zone's. On
 * the old 184-deep board the new player took 16–21 turns to walk home
 * after the core fell, and half its assaults ran out of turns on the
 * way. Placed at half the walk, the wins on the Great Hive's quicker
 * nests still ran to the turn cap; at three-eighths more of them end
 * clean (`great-hive-setup-tuning.ts`). On 64 seeds the point lies
 * 31–85 steps from the core, 0.19–0.53 of the walk (median 0.37): the
 * route has few chambers to choose from.
 *
 * It keeps 45% of the chamber's radius (4 at the least) from the brood
 * tile, just outside the heart where the brood sleeps, unless that
 * costs 20 steps off the mark (a chamber of radius 7 or 8 has no room
 * for it); it keeps 4 columns from any nest, and takes only ground no
 * prop stands on.
 */
export const GREAT_HIVE_CAVERN_TUNING: HiveCavernTuning = {
  ...HIVE_CAVERN_TUNING,
  chamberCount: { min: 8, max: 9 },
  sideChamberCount: { min: 2, max: 4 },
  minRouteChambers: 5,
  coreRadius: { min: 14, max: 16 },
  burrowCount: { min: 3, max: 4 },
  coreHives: { min: 5, max: 7 },
  forwardExtraction: {
    coreShare: 0.375,
    size: 4,
    heartClearanceShare: 0.45,
    minHeartClearance: 4,
    heartPenalty: 20,
    nestClearance: 4,
  },
};
