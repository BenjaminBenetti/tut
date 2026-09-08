import type { FencePlacementTuning } from "../model/fence-placement-tuning";

/** Six-to-twenty metre boundaries, with four metre access openings. */
export const FENCE_PLACEMENT_TUNING: FencePlacementTuning = {
  minRun: 3,
  maxRun: 10,
  opening: 2,
  trailOffset: 2,
  maxTrailOffset: 3,
  yardOffset: 2,
};
