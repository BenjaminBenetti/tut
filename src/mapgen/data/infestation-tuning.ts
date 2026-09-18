import type { InfestationTuning } from "../model/infestation-tuning";

/** Colonies claim districts and connect them with feeding lanes before lots are assigned. */
export const INFESTATION_TUNING: InfestationTuning = {
  columnsPerColony: 680,
  minimumColonySpacing: 10,
  baseRadius: 3,
  radiusPerLevel: 1.05,
  baseClearingRadius: 1.2,
  clearingRadiusPerLevel: 0.32,
  growthThreshold: 0.16,
  corridorWidth: 1.5,
  noiseFrequency: 0.19,
  hookClearance: 1,
  propsPerGrowthTile: 0.055,
};
