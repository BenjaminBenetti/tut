import type { LurkerTuning } from "../model/lurker-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights: once adjacency is reachable it wins (adjacent plus
 * behind outscores any hidden tile), the behind tile beats the front by
 * the behind weight, and while still approaching the lurker prefers
 * tiles the mark's friends cannot see and stays on the mark's level.
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
