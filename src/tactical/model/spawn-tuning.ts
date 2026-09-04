// ===========================================
// Spawn tuning
// ===========================================

/**
 * Balance knobs for egg spawners and edge waves (GDD §6.3). Services
 * receive a tuning object rather than importing the defaults, so tests
 * and difficulty settings can substitute their own. Defaults live in
 * `tactical/data/spawn-tuning.ts`.
 *
 * ```
 *   hatchInterval = max( minHatchInterval,
 *                        ⌊ hatchInterval − (difficulty − 1) × hatchCutPerDifficulty ⌋ )
 *            every that many bug phases a live spawner releases
 *            hatchCount bugs into its hatch space
 *
 *   waveInterval = max( minWaveInterval,
 *                       ⌊ waveInterval − (difficulty − 1) × intervalCutPerDifficulty
 *                                      − threat / 100 × intervalCutAtMaxThreat ⌋ )
 *   waveSize     = min( maxWaveSize,
 *                       ⌊ baseWaveSize + wave × sizePerWave
 *                                      + (difficulty − 1) × sizePerDifficulty
 *                                      + threat / 100 × sizeAtMaxThreat ⌋ )
 * ```
 */
export interface SpawnTuning {
  /** Hit points an egg spawner starts with. Positive integer. */
  readonly spawnerHp: number;
  /** Bug phases between one spawner's hatches at difficulty one. Positive integer. */
  readonly hatchInterval: number;
  /**
   * Bug phases cut from that interval per difficulty step above one.
   * Non-negative.
   *
   * This is the difficulty ladder (#497). Spawner count steps 2 → 3 → 4
   * across the whole range and nothing else moved a mission: wave size
   * is capped by how many bugs can reach a unit at melee range, and the
   * wave interval floors at `minWaveInterval` by difficulty 4. Hatching
   * is what decides whether a force out-kills the board, and it had no
   * difficulty term at all — measured at difficulty 5, moving this
   * interval alone took the mission from a coin flip over 43 turns to a
   * clean sweep in 10.
   */
  readonly hatchCutPerDifficulty: number;
  /** Least bug phases between hatches however far things escalate. Positive integer. */
  readonly minHatchInterval: number;
  /** Bugs one hatch releases, room permitting. Non-negative integer. */
  readonly hatchCount: number;
  /** Turn the first edge wave arrives on. Positive integer. */
  readonly firstWaveTurn: number;
  /** Turns between edge waves before any escalation. Positive integer. */
  readonly waveInterval: number;
  /** Least turns between edge waves however far things escalate. Positive integer. */
  readonly minWaveInterval: number;
  /** Turns cut from the interval per difficulty step above one. Non-negative. */
  readonly intervalCutPerDifficulty: number;
  /** Turns cut from the interval at threat 100, scaled linearly below it. Non-negative. */
  readonly intervalCutAtMaxThreat: number;
  /** Bugs in the first wave at difficulty one and threat zero. Non-negative integer. */
  readonly baseWaveSize: number;
  /** Extra bugs per wave that has already arrived. Non-negative. */
  readonly sizePerWave: number;
  /** Extra bugs per difficulty step above one. Non-negative. */
  readonly sizePerDifficulty: number;
  /** Extra bugs at threat 100, scaled linearly below it. Non-negative. */
  readonly sizeAtMaxThreat: number;
  /** Most bugs one wave brings, whatever the escalation. Positive integer. */
  readonly maxWaveSize: number;
}
