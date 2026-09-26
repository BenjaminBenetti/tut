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
 *
 *   podHp        = ⌊ podHp + (difficulty − 1) × podHpPerDifficulty ⌋
 *   podBurstSize = min( maxWaveSize, waveSize(next wave, …) + podBurstBonus )
 *            a spore pod left standing through podMaturityTurn matures at
 *            the next phase start and releases podBurstSize bugs around it
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
  /** Hit points a spore pod starts with at difficulty one (campaign arc §6.3). Positive integer. */
  readonly podHp: number;
  /** Extra pod hit points per difficulty step above one. Non-negative. */
  readonly podHpPerDifficulty: number;
  /**
   * The last turn a spore pod can be wrecked on: it matures once this
   * turn has ended, so it is its objective's `deadlineTurn`. Positive
   * integer.
   */
  readonly podMaturityTurn: number;
  /**
   * Bugs a maturing pod releases beyond the next edge wave's size, which
   * already scales with difficulty, waves so far and threat; the total
   * is still capped at `maxWaveSize`. Non-negative integer.
   */
  readonly podBurstBonus: number;
  /**
   * Edge waves a crash site sends before its edges fall quiet (campaign
   * arc §6.3): the pod and its clock are the pressure, so the waves stay
   * few. Its `edgeSpawn.totalWaves`. Non-negative integer.
   */
  readonly podEdgeWaves: number;
}
