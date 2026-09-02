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
 */
export const INFESTATION_TUNING: InfestationTuning = {
  baseGrowthRate: 3,
  threatFactor: 1,
};
