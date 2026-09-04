import type { SwarmerTuning } from "../model/swarmer-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights, ordered so the rush is never talked out of advancing.
 * One tile of distance costs 1, while every reward a farther tile could
 * collect sums to `adjacentWeight + swarmWeight` = 0.9. So on level
 * ground a tile strictly closer to the target always outscores a farther
 * one, whatever the company:
 *
 * ```
 *   closer tile  ≥ −d − 0            (nothing else needed)
 *   farther tile ≤ −(d + 1) + 0.9    (adjacent and in full company)
 *                = −d − 0.1          < −d
 * ```
 *
 * Kin therefore only break ties between tiles that close the same
 * distance — a swarmer prefers to arrive beside its own kind, but never
 * waits for them. Elevation is the one deliberate exception: four levels
 * of climb outweigh a tile of approach, which is how a swarmer is kept
 * off rooftops it has no business on.
 */
export const SWARMER_TUNING: SwarmerTuning = {
  approachWeight: 1,
  adjacentWeight: 0.5,
  swarmWeight: 0.4,
  swarmRadius: 2,
  levelWeight: 0.25,
};
