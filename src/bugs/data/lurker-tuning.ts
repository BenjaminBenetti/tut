import type { LurkerTuning } from "../model/lurker-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights: once adjacency is reachable it wins (adjacent plus
 * behind outscores any hidden tile), the behind tile beats the front by
 * the behind weight, and while still approaching the lurker prefers
 * tiles the mark's friends cannot see and stays on the mark's level.
 *
 * `exposureWeight` was set while `exposureScore` read `1` on every tile
 * of the map — it asked for a clear line and never for sight range
 * (#663) — so it was chosen against a constant, which cancels out of
 * the comparison entirely. Measured against the corrected score (#676),
 * on a 40-wide field with the mark's friend placed so the reachable
 * tiles straddle the edge of what it sees:
 *
 * ```
 *   exposureWeight   0    0.75   1.5    3     6
 *   destination     same  same   same  same  differs in 1 of 4 geometries
 * ```
 *
 * So the term is live — the fixture in `lurker-behaviour.test.ts` shows
 * three distinct exposure values on one board, and inverting the weight
 * moves the lurker into view — but at anything near 1.5 it is dominated
 * by approach and adjacency and does not change where the lurker goes.
 * Left at 1.5 because the measurement gives no reason to prefer another
 * value in that range, and making concealment actually outrank closing
 * is a design decision about how the lurker should read, not an
 * arithmetic one.
 *
 * Caveat on the method: those are single-turn destinations on flat open
 * fields. Cover and broken terrain could let the term bite where a bare
 * field does not.
 */
export const LURKER_TUNING: LurkerTuning = {
  flankWeight: 3,
  behindWeight: 2,
  adjacentWeight: 2.5,
  exposureWeight: 1.5,
  levelWeight: 0.5,
  approachWeight: 2,
  isolationRadius: 3,
  isolationWeight: 1.5,
  approachHorizon: 12,
};
