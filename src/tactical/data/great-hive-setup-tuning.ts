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
 *   still ahead; 150 brings the expert home in about 40 turns (#1179 C3a).
 * - Six guards at level 0 fill the core chamber's ring; a lost assault
 *   adds one each time. The core chamber is crowded with hive
 *   structures, so the guard packs shoulder to shoulder when the spaced
 *   ring runs short (`packGuards`).
 * - The broods are thinner because there are more of them: 8–10 brood
 *   chambers against the ordinary cavern's 4–7. A mass-woken ordinary
 *   cavern already costs 7–13 s a bug phase on a loaded machine, so the
 *   Great Hive's total is held near an ordinary d8 cavern's rather than
 *   doubled (measured in `docs/design/great-hives.md`).
 * - The nests keep the ordinary hive's slow pace, one bug every 11
 *   turns at d8, at every difficulty: the ordinary hive's quicker nests
 *   from d6 (#1179 C3a round 2) do not apply. A Great Hive's walk is
 *   already 189–232 steps against the ordinary 120–165, and the new
 *   player won 8 of 16 on the slow nests, 5 of them only by the turn
 *   cap's rule (the core down and someone aboard).
 * - Everything else — nest bounty, edge waves, species mix, wake rules
 *   — is the ordinary Hive Assault's.
 */
export const GREAT_HIVE_SETUP_TUNING: GreatHiveSetupTuning = {
  assault: {
    ...HIVE_ASSAULT_SETUP_TUNING,
    coreHp: 150,
    coreHpPerLevel: 20,
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
