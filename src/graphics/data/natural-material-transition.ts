import type { NaturalMaterialTransitionTuning } from "../model/natural-material-transition";

/** Existing atlas surfaces. Other surfaces keep their authored, deliberate edges. */
export const NATURAL_MATERIAL_SURFACES = [
  "grass",
  "dirt",
  "sand",
  "snow",
  "rock",
] as const;

/** Sub-tile irregularity with a narrow contact band, rather than blurred patches. */
export const NATURAL_MATERIAL_TRANSITION: NaturalMaterialTransitionTuning = {
  samplesPerTile: 16,
  warpAmplitude: 0.55,
  warpFrequency: 0.8,
  detailFrequency: 3.7,
  detailShare: 0.25,
  sharpness: 8,
};
