import type { SporePlatformTuning } from "../model/spore-platform-tuning";

// ===========================================
// Spore platform tuning
// ===========================================

/**
 * The shipped shape of the spore platform's two stages (#1179). The hull
 * board is 72 × 104 and the core board 64 × 80 (see
 * `spore-platform-recipe`); every length here is measured against them.
 */
export const SPORE_PLATFORM_TUNING: SporePlatformTuning = {
  deckLevel: 4,
  plateSpacing: 9,
  raisedPlateShare: 0.4,
  darkPlateShare: 0.5,
  rimNoise: 2,
  rimFrequency: 0.09,
  clutterPerHundred: 1.1,
  ribWallsPerThousand: 3,
  ribWallLength: { min: 3, max: 6 },
  hull: {
    prowHalfWidth: 7,
    prowLength: 16,
    flareLength: 20,
    maxHalfWidth: 29,
    sideMargin: 3,
    spineBow: 6,
    spineWaypointEvery: 22,
    routeRadius: 2,
    ringDepthShare: { min: 0.45, max: 0.56 },
    ringOffset: 18,
    ringPlazaRadius: 7,
    ringPadSize: 5,
    exitPadSize: 4,
    exitBack: 12,
    podBeds: { min: 4, max: 6 },
    podBedRadius: 3,
    firstPodBedDistance: { min: 16, max: 26 },
    podBedSpacing: 14,
    breaches: { min: 1, max: 3 },
    breachRadius: { min: 2, max: 3 },
    buttressEvery: 6,
  },
  core: {
    startPadHalfWidth: 4,
    startPadDepth: 6,
    causewayLength: { min: 12, max: 15 },
    causewayWidth: 3,
    chamberRadius: 26,
    // Rim walkway at deck level, then a berm of terraces one, two and one
    // layer up, stepping down into the arena where the core lies.
    terraces: [
      { width: 6, rise: 0 },
      { width: 3, rise: 1 },
      { width: 3, rise: 2 },
      { width: 3, rise: 1 },
    ],
    laneWidth: 4,
    daisSize: 4,
    corePadSize: 6,
    guardPostSize: 2,
    ductWidth: 4,
    ductBehind: { min: 2, max: 5 },
    niches: 12,
    nicheClearance: 0.45,
    arteries: { min: 4, max: 6 },
  },
};
