// ===========================================
// Spitter tuning
// ===========================================

/**
 * Weights the spitter's tile scoring composes (#1179); a substitute
 * reshapes the snipe. Every term is a reward or a penalty on one tile it
 * could end its move on, standing still included:
 *
 * ```
 *   firing tile (a target in reach and sight, an action left to spit)
 *     score = shotWeight + value·valueWeight + cover·coverWeight
 *             − exposure(others)·exposureWeight
 *   any other tile
 *     score = −gap·approachWeight + cover·coverWeight
 *             − exposure(all)·exposureWeight
 *   every tile
 *     score −= movement·stepWeight
 * ```
 *
 * `shotWeight` must stay above `coverWeight`, so a tile it can fire
 * from beats any tile it cannot. Adjacency is not weighed: a tile beside
 * an enemy is filtered out while any other can be reached. See
 * `SPITTER_TUNING`.
 */
export interface SpitterTuning {
  /** Reward for a tile it can fire from this turn. Dominates every other term. */
  readonly shotWeight: number;
  /** Reward per expected fraction of the target's hit points one spit removes (`targetValue`). */
  readonly valueWeight: number;
  /** Reward per fraction of high cover the tile gives against return fire (`coverScore`). */
  readonly coverWeight: number;
  /** Penalty per fraction of enemies (other than the target, on a firing tile) that see the tile (`exposureScore`). */
  readonly exposureWeight: number;
  /** Penalty per tile still to close before an enemy is in reach, for tiles it cannot fire from. */
  readonly approachWeight: number;
  /** Penalty per movement point spent getting there, so it does not wander between equal tiles. */
  readonly stepWeight: number;
}
