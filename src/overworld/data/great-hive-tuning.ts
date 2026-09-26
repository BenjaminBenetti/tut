import type { GreatHiveTuning } from "../model/great-hive-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default Great Hive tuning (campaign arc §3 Act III, §6.9):
 *
 * - `count` 3: the platform's three beacons.
 * - `difficulty` 8, `act` `"act-3"`: fixed, like every story mission
 *   (arc §3: story missions carry a fixed difficulty), rather than a
 *   ramp. Act III's band is d5–9 and Launch Window, the mission the
 *   three unlock, is d8; a fixed value keeps all three assaults equal,
 *   so the player can take them in any order, and gives the 65% target
 *   one number to calibrate against.
 * - `techRewardMultiplier` 2.5: an ordinary d8 Hive Assault pays 68 TP,
 *   so a Great Hive pays 170. The three together pay 510, well over the
 *   280 of Intel III, the act's other gate.
 * - `maxLevel` 2: a lost assault adds one level, twice at most. A level
 *   is +20 core hit points and one more guard (the tactical setup's
 *   Great Hive tuning), so a loss costs a little and never compounds.
 */
export const GREAT_HIVE_TUNING: GreatHiveTuning = {
  count: 3,
  difficulty: 8,
  act: "act-3",
  techRewardMultiplier: 2.5,
  maxLevel: 2,
};
