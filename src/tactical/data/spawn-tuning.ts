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
 */
export const SPAWN_TUNING: SpawnTuning = {
  spawnerHp: 20,
  hatchInterval: 3,
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
