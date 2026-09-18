import type { InfestationTuning } from "../model/infestation-tuning";

/** Infestation keeps some clean ground and intact shelter even on an overrun map. */
export const INFESTATION_TUNING: InfestationTuning = {
  groundShare: 0.7,
  patchFrequency: 0.16,
  nestShare: 0.025,
  wallDamageShare: 0.65,
  roofDamageShare: 0.6,
  hookClearance: 3,
};
