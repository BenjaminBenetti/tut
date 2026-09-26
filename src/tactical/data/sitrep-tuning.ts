import type { SitrepTuning } from "../model/sitrep-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default sitrep tuning (campaign arc §11). Placeholders until the
 * sitreps have been played:
 *
 * - **Nightfall** takes 4 off everyone's sight, floored at 3: infantry
 *   see 8, mechs 10, bugs 6, a turret 8. A generator's 4 drops to 3.
 *   Weapon range is untouched, so a squad can still shoot what a
 *   teammate cannot see; overwatch, which fires on what its turret or
 *   squad sees, reaches less far.
 * - **Spore Fog** scatters one cloud per 576 tiles: 4 on a small map,
 *   9 on a medium one, 16 on a large one. A cloud is a radius-2 diamond
 *   (up to 13 tiles) of ordinary smoke on open ground, lasting 16
 *   phases (eight rounds) instead of a grenade's 4, and none of it
 *   within 4 of the deploy zone.
 * - **City Ablaze** lights one blaze per 1728 tiles, clamped to 2..4:
 *   2 small, 3 medium, 4 large. A blaze is up to 5 fire tiles (a centre
 *   and its four neighbours) with the hazard tuning's clock, relit every
 *   3 turns, kept 6 from the deploy zone and 3 from anything the
 *   mission is about. The cap is there because every fire carries a
 *   point light.
 * - **Salvage Rich** adds 2 carcasses, priced like the offer's own
 *   (`MISSION_TUNING.techCarcass`: 10 + 2 per difficulty), at least 8
 *   from the deploy zone, 4 from objectives and 8 from each other.
 */
export const SITREP_TUNING: SitrepTuning = {
  nightfall: { sightPenalty: 4, sightFloor: 3 },
  sporeFog: {
    tilesPerCloud: 576,
    radius: 2,
    phases: 16,
    deployClearance: 4,
    spacing: 8,
  },
  cityAblaze: {
    tilesPerBlaze: 1728,
    minBlazes: 2,
    maxBlazes: 4,
    deployClearance: 6,
    objectiveClearance: 3,
    spacing: 10,
    rekindleEvery: 3,
  },
  salvageRich: {
    carcasses: 2,
    basePoints: 10,
    pointsPerDifficulty: 2,
    minFromDeploy: 8,
    preferWithin: 30,
    objectiveClearance: 4,
    spacing: 8,
  },
};
