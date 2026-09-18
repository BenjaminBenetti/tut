import type { CarapaceSiteTuning } from "../model/carapace-site-tuning";

/** Mature colonies assemble separate wall runs while keeping most of their interiors open. */
export const CARAPACE_SITE_TUNING: CarapaceSiteTuning = {
  minimumLevel: 6,
  largeFormationLevel: 8,
  minimumSpan: 8,
  maximumSpan: 10,
  outlineAttempts: 4,
  maximumGateGrading: 1,
  minimumApproachPressure: 0.25,
  straightStyleThresholds: { spine: 18, broken: 25, overlap: 50, ribbed: 75 },
  clearance: 1,
  minimumPressure: 0.4,
  colonyShare: 0.5,
  centreSearchRadius: 3,
  minimumModules: 12,
  minimumRunLength: 3,
  minimumRetainedShare: 0.5,
};
