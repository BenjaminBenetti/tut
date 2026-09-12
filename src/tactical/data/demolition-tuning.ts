import type { DemolitionTuning } from "../model/demolition-tuning";

// ===========================================
// Defaults
// ===========================================

/** Default demolition tuning (#1121); see `DemolitionTuning` for the ladder. */
export const DEMOLITION_TUNING: DemolitionTuning = {
  wallForce: { half: 1, window: 2, door: 2, solid: 3 },
};
