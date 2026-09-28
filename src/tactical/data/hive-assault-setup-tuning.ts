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
 *
 * The cavern is a long walk there and back, so its pressure is the
 * broods and the core's guard, not a clock (#1179 C3a, measured in
 * `docs/design/calibration/C3a-hives.md`):
 *
 * - Up to difficulty 5 the chamber nests hatch one bug each, every 12
 *   turns (the spawn tuning's 4 plus eight). Two bugs every 3–4 turns
 *   from each of two to four nests out-bred C2a's five-unit Act II force
 *   before it reached the core.
 * - From difficulty 6 they quicken (round 2, on C2c's eight-unit
 *   forces). Three refit mechs shrug off most hive bugs, so the new
 *   player lost only by running out of turns on the walk home, and won
 *   15 of 16 Act III assaults on the slow nests. The quicker nests
 *   stretch that walk in the top two steps of Act II's band (d3–7) and
 *   all but the bottom step of Act III's (d5–9):
 *
 *   ```
 *     difficulty    ≤5          6             7+
 *     a nest        1 bug / 12  1 bug / 4     2 bugs / 4    (bug phases)
 *     new player    Act II 16 → 12 of 16, Act III 15 → 11 of 16
 *   ```
 *
 *   The Great Hive keeps the slow nests (`great-hive-setup-tuning.ts`).
 * - The burrows send no edge waves. One wave cost Act II half its wins.
 */
export const HIVE_ASSAULT_SETUP_TUNING: HiveAssaultSetupTuning = {
  coreHp: 60,
  coreHpPerLevel: 15,
  baseGuards: 2,
  guardsPerLevel: 0.5,
  minGuards: 2,
  maxGuards: 4,
  nestBounty: 5,
  nestHatchBonus: -1,
  nestHatchDelay: 8,
  nestPaceByDifficulty: [
    { fromDifficulty: 6, hatchBonus: -1, hatchDelay: 0 },
    { fromDifficulty: 7, hatchBonus: 0, hatchDelay: 1 },
  ],
  edgeWaves: 0,
};
