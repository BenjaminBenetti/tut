import type { CarapaceSiteTuning } from "../model/carapace-site-tuning";

/** Half the mature colonies may support a carapace building; ordinary nests fill the rest. */
export const CARAPACE_SITE_TUNING: CarapaceSiteTuning = {
  minimumLevel: 6,
  keepMinimumLevel: 8,
  clearance: 1,
  minimumPressure: 0.55,
  maximumGrading: 1,
  colonyShare: 0.5,
  centreSearchRadius: 3,
};
