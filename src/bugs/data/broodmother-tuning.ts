import type { BroodmotherTuning } from "../model/broodmother-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped numbers (#1179), sized against the rest of the bestiary and
 * the arc's Alpha Hunt (§6.8):
 *
 * - **A boss's hit points.** 42 at difficulty 1, 2 more a step, so 60 at
 *   difficulty 10: a brute and a half at Act II's d3–7 (46 to 54). A
 *   scar adds a quarter of that (arc §6.8, "+25 % HP"), so she comes
 *   back from each escape harder to finish. Calibrated on the filled
 *   Act II and III forces (`docs/design/calibration/C3b-story.md`):
 *   at 60 a new player killed her in half the Act II hunts, most of the
 *   rest running out of time as she made the edge; at 42 it is about
 *   three in four, and Act III's hunt stays near its 65 %.
 * - **A clutch every 3 turns** (arc §6.8). A clutch is an ordinary egg
 *   spawner, so it hatches on the spawn tuning's clock: a squad that
 *   ignores her fights more of her brood every few turns.
 * - **Half health and she runs** (arc §6.8), and does not come back.
 * - **Out of reach first.** A tile inside one visible enemy's weapon
 *   reach costs 10, more than the 4 of clearance (`marginCap` ×
 *   `marginWeight`) any tile can earn, so she leaves reach whenever a
 *   tile outside it can be reached, and inside it she takes the tile
 *   covered by the fewest guns.
 * - **Then clearance, but not forever.** A tile of clearance is worth
 *   1 up to 4 tiles beyond the nearest reach; past that she holds, so
 *   she shadows the squad instead of fleeing to a corner before she
 *   has to.
 * - **She does not wander.** 0.02 a movement point, as the spitter.
 * - **Blind, she shadows.** With no enemy in view she keeps 12 tiles
 *   from where the swarm last saw one: past a carbine's 8, so the squad
 *   has to come to her, and near enough that her hatchlings find it.
 */
export const BROODMOTHER_TUNING: BroodmotherTuning = {
  hpBase: 42,
  hpPerDifficulty: 2,
  scarHpBonus: 0.25,
  clutchInterval: 3,
  fleeAtHpFraction: 0.5,
  threatWeight: 10,
  marginWeight: 1,
  marginCap: 4,
  stepWeight: 0.02,
  standOff: 12,
  approachWeight: 1,
};
