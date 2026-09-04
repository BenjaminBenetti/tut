// ===========================================
// Lurker tuning
// ===========================================

/** Weights the lurker's tile scoring composes; a substitute reshapes the stalk. */
export interface LurkerTuning {
  /** Reward for a tile whose attack on the mark would flank. */
  readonly flankWeight: number;
  /** Reward for standing on the tile directly behind the mark's facing. */
  readonly behindWeight: number;
  /** Reward for any tile adjacent to the mark, so closing beats hiding once it can strike. */
  readonly adjacentWeight: number;
  /** Penalty per fraction of enemies other than the mark that can see the tile. */
  readonly exposureWeight: number;
  /** Penalty per level of height difference from the mark; rooftops are not a flank. */
  readonly levelWeight: number;
  /** Reward for closing the distance to the mark. */
  readonly approachWeight: number;
  /** Radius the mark's company is counted within; stragglers are preferred. */
  readonly isolationRadius: number;
  /** Penalty per fraction of enemies near the mark. */
  readonly isolationWeight: number;
  /** Distance at which `approachWeight` has fully decayed. */
  readonly approachHorizon: number;
}
