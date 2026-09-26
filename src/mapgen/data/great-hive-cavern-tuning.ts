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
 *   chambers           5–8             9–11
 *   side chambers      1–3             2–4
 *   route at least     4               6
 *   core radius        12–14           14–16
 *   burrows            2–3             3–4
 *   hives by the core  3–5             5–7
 * ```
 *
 * On the 184-deep board the route holds at most 9 chambers before the
 * planner shrinks them to the minimum radius, so 11 chambers leave at
 * least two for the sides.
 */
export const GREAT_HIVE_CAVERN_TUNING: HiveCavernTuning = {
  ...HIVE_CAVERN_TUNING,
  chamberCount: { min: 9, max: 11 },
  sideChamberCount: { min: 2, max: 4 },
  minRouteChambers: 6,
  coreRadius: { min: 14, max: 16 },
  burrowCount: { min: 3, max: 4 },
  coreHives: { min: 5, max: 7 },
};
