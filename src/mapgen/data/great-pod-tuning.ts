import type { GreatPodTuning } from "../model/great-pod-tuning";

// ===========================================
// Great pod tuning
// ===========================================

/**
 * First Skyfall's great pod (#1238), sized for Act I's 48² board at
 * ADR 0009's 2 m a tile:
 *
 * - a hull of radius 8, 17 tiles (34 m) across, a third of the board:
 *   big enough to fight inside, small enough to leave the landing and
 *   the edges their ground;
 * - a membrane of radius 4 round a 3×3 core, leaving a core chamber one
 *   to two tiles deep all round, where eight units can stand by the core;
 * - outer chambers two to three tiles wide between membrane and hull,
 *   wide enough for a mech, and three-tile mouths and seams;
 * - three apron rings, the first kept clear so a breach party can stand
 *   at the wall, the other two strewn with thrown wreckage for cover;
 * - landed two columns south of the drop ship's clearance, so the hull
 *   is one move from the boarding ramp and the core two.
 */
export const GREAT_POD_TUNING: GreatPodTuning = {
  hullRadius: 8,
  membraneRadius: 4,
  mouthHalfWidth: 1,
  coreSize: 3,
  apron: 3,
  verge: 1,
  debrisDensity: 14,
  landingGap: 2,
  jitter: 3,
  edgeMargin: 2,
  chamberRadius: 2,
  coreChamberRadius: 3,
};
