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
 *   core hp         60 / 90                    200 / 240
 *   guards          2 / 3 (at most 4)          6 / 8 (at most 8)
 *   brood at d8     route 13, side 10, core 18 route 8, side 6, core 12
 * ```
 *
 * - The core takes a focused squad two or three turns rather than one.
 * - Six guards at level 0 fill the core chamber's ring; a lost assault
 *   adds one each time. The core chamber is crowded with hive
 *   structures, so the guard packs shoulder to shoulder when the spaced
 *   ring runs short (`packGuards`).
 * - The broods are thinner because there are more of them: 8–10 brood
 *   chambers against the ordinary cavern's 4–7. A mass-woken ordinary
 *   cavern already costs 7–13 s a bug phase on a loaded machine, so the
 *   Great Hive's total is held near an ordinary d8 cavern's rather than
 *   doubled (measured in `docs/design/great-hives.md`).
 * - Everything else — nest bounty, species mix, wake rules — is the
 *   ordinary Hive Assault's.
 */
export const GREAT_HIVE_SETUP_TUNING: GreatHiveSetupTuning = {
  assault: {
    ...HIVE_ASSAULT_SETUP_TUNING,
    coreHp: 200,
    coreHpPerLevel: 20,
    baseGuards: 6,
    guardsPerLevel: 1,
    minGuards: 6,
    maxGuards: 8,
    packGuards: true,
  },
  broods: {
    ...BROOD_TUNING,
    baseSize: 4,
    maxSize: 12,
  },
};
