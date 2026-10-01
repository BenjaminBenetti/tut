import type { GreatHiveSetupTuning } from "../model/great-hive-setup-tuning";
import { BROOD_TUNING } from "./brood-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "./hive-assault-setup-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default Great Hive setup (campaign arc §6.9), against an ordinary Hive
 * Assault at the same level:
 *
 * ```
 *                   ordinary (level 0 / 2)     Great Hive (level 0 / 2)
 *   core hp         60 / 90                    150 / 190
 *   guards          2 / 3 (at most 4)          6 / 8 (at most 8)
 *   brood at d8     route 11, side 8, core 11  route 8, side 6, core 8
 * ```
 *
 * - The core takes a focused squad two or three turns rather than one.
 *   At 200 the Act III force spent 7–15 turns at it with the walk home
 *   still ahead; 150 brought the expert home in about 40 turns (#1179
 *   C3a), and in about 29 since round 3's forward point.
 * - Six guards at level 0 fill the core chamber's ring; a lost assault
 *   adds one each time. The core chamber is crowded with hive
 *   structures, so the guard packs shoulder to shoulder when the spaced
 *   ring runs short (`packGuards`).
 * - The broods are thinner because there are more of them: 6–8 brood
 *   chambers against the ordinary cavern's 4–7. A mass-woken ordinary
 *   cavern already costs 7–13 s a bug phase on a loaded machine, so the
 *   Great Hive's total is held near an ordinary d8 cavern's rather than
 *   doubled (measured in `docs/design/great-hives.md`).
 * - The nests hatch one bug more than a clearance nest, and wait three
 *   bug phases more between hatches, at every difficulty: three bugs
 *   every 6 turns at d8, where an ordinary hive's hatch two every 4
 *   (`nestPaceByDifficulty` is emptied so its steps do not apply).
 *   #1179 C3a round 3 gave the Great Hive a forward extraction point
 *   and a shorter cavern; on the old slow nests (one bug every 11) the
 *   new player then won 31 of 32. The same bugs a turn in bigger,
 *   rarer clutches leave lulls the force moves in: with the point at
 *   0.3 of the walk, two every 4 won 36 of 64 with 20 clean, three
 *   every 6 won 37 with 31 clean. Over 128 seeds the new player wins
 *   62 (48%) against 55 before round 3, 39 of them clean against 31.
 *
 *   ```
 *   bugs from one nest at d8, turns 1–12
 *   ordinary hive   · · · 2 · · · 2 · · · 2    two every 4
 *   Great Hive      · · · · · 3 · · · · · 3    three every 6
 *   ```
 * - Everything else — nest bounty, edge waves, species mix, wake rules
 *   — is the ordinary Hive Assault's.
 */
export const GREAT_HIVE_SETUP_TUNING: GreatHiveSetupTuning = {
  assault: {
    ...HIVE_ASSAULT_SETUP_TUNING,
    coreHp: 150,
    coreHpPerLevel: 20,
    nestHatchBonus: 1,
    nestHatchDelay: 3,
    nestPaceByDifficulty: [],
    baseGuards: 6,
    guardsPerLevel: 1,
    minGuards: 6,
    maxGuards: 8,
    packGuards: true,
  },
  broods: {
    ...BROOD_TUNING,
    baseSize: 4,
    sizePerDifficulty: 0.5,
    maxSize: 12,
  },
};
