import type { InfestationTuning } from "../model/infestation-tuning";

/** Resin Shell progression selected by the user: traces through almost total coverage. */
export const MAP_INFESTATION_TUNING: InfestationTuning = {
  coverageByLevel: [
    0, 0.025, 0.06, 0.13, 0.24, 0.38, 0.52, 0.66, 0.8, 0.91, 0.98,
  ],
  patchSize: 7,
};
