// ===========================================
// Swarmer tuning
// ===========================================

/**
 * Weights the swarmer's tile scoring composes; a substitute reshapes the
 * rush. `approachWeight` is a penalty per tile of distance rather than a
 * reward that decays to nothing over some horizon, so the rush cannot
 * flat-line on a map wider than that horizon and start picking tiles at
 * random. Keeping it above `adjacentWeight + swarmWeight` is what makes
 * "closes the distance every turn" an invariant on level ground rather
 * than a hope: see `SWARMER_TUNING`.
 */
export interface SwarmerTuning {
  /**
   * Penalty per tile of Manhattan distance from the target. Dominates:
   * above the sum of the rewards below, so no amount of company can talk
   * a swarmer out of advancing.
   */
  readonly approachWeight: number;
  /** Reward for a tile adjacent to the target on its level, from which it can bite. */
  readonly adjacentWeight: number;
  /** Reward per fraction of living kin already within `swarmRadius` of the tile. */
  readonly swarmWeight: number;
  /** Radius kin are counted within when grouping up. */
  readonly swarmRadius: number;
  /** Penalty per level of height difference from the target; swarmers do not take rooftops. */
  readonly levelWeight: number;
}
