import type { InfestationTuning } from "../model/infestation-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default infestation tuning. Placeholders until the tick pipeline (#68)
 * is playable end to end:
 *
 * - `baseGrowthRate` 3: an untouched city goes from a foothold to overrun
 *   in roughly a month at zero threat.
 * - `threatFactor` 1: growth doubles at maximum threat.
 * - `spreadThreshold` 60, `spreadAmount` 10, `spreadCooldownDays` 5: a
 *   city past the threshold pushes a foothold into a neighbour every
 *   five days, so an ignored city infects its neighbourhood in a few
 *   weeks.
 * - `seedChance` 0.02: at maximum threat a clean city has a two percent
 *   chance per day of a fresh landing; at low threat seeding is rare.
 * - `seedAmount` 5: a seeded city starts as a small foothold.
 * - `hiveSpreadMultiplier` 1: no hives in M1, so no boost.
 * - `regionDetectionThreshold` 15, `cityDetectionThreshold` 30 (GDD
 *   §5.3): a lone foothold seeded at 5 grows 3 a day and is found on its
 *   own after about eight days; in a region whose mean has reached 15
 *   every infested city is found at once. A sensor array scales both
 *   down (`deployable-types`).
 */
export const INFESTATION_TUNING: InfestationTuning = {
  baseGrowthRate: 3,
  threatFactor: 1,
  spreadThreshold: 60,
  spreadAmount: 10,
  spreadCooldownDays: 5,
  seedChance: 0.02,
  seedAmount: 5,
  hiveSpreadMultiplier: 1,
  regionDetectionThreshold: 15,
  cityDetectionThreshold: 30,
};
