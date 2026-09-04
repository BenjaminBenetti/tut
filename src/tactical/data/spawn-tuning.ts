import type { SpawnTuning } from "../model/spawn-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default spawn tuning. Placeholders until M2 is playable end to end
 * (#345 tunes against the auto-resolver):
 *
 * - A spawner takes a squad's focused turn to kill (20 hp) and hatches
 *   two bugs every three bug phases, so an ignored spawner roughly
 *   matches a rifle squad's kill rate.
 * - The first edge wave lands on turn 3 with two bugs, then every four
 *   turns, one bug bigger each time; difficulty 3 shaves a turn off the
 *   interval and adds two bugs, maximum threat does the same again;
 *   never more than eight at once or closer than two turns apart.
 *
 * **The hatch interval is the difficulty ladder (#497), and its usable
 * band is two values wide.** Measured on fixed maps at a 90-turn cap:
 *
 * ```
 *   interval 2   d10 0/6 won   unwinnable — the loss grinds 22-54 turns
 *   interval 3   d5-d10 ~3/6   today's behaviour
 *   interval 4   d5 6/6        walkover
 *   interval 5   d5 5/6, d10 4/6
 * ```
 *
 * Below 3 a mission cannot be won and above 4 it cannot be lost, so a
 * ten-step ladder cannot be cut from it: `floor()` emits 5,4,4,4,4,4,3,3,3,3
 * and the step relocates rather than becoming a gradient. The bottom of
 * the band is closed by the losing tail, not by the spawn rate — a mech
 * carries 9 armour against `minDamage` 1, so a horde of swarmers takes
 * ~30 turns to finish a fight that was decided by turn 10. Widening the
 * ladder needs that fixed first; calibrating where it lands is #734.
 */
export const SPAWN_TUNING: SpawnTuning = {
  spawnerHp: 20,
  hatchInterval: 5,
  hatchCutPerDifficulty: 0.2,
  minHatchInterval: 3,
  hatchCount: 2,
  firstWaveTurn: 3,
  waveInterval: 4,
  minWaveInterval: 2,
  intervalCutPerDifficulty: 0.5,
  intervalCutAtMaxThreat: 1,
  baseWaveSize: 2,
  sizePerWave: 1,
  sizePerDifficulty: 1,
  sizeAtMaxThreat: 2,
  maxWaveSize: 8,
};
