import type { UpgradeTuning } from "../model/upgrade-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The default upgrade tuning, for injection into the upgrade and
 * validation services. Three levels of +10 % each keep a maxed part
 * clearly better without outclassing the next tier.
 */
export const UPGRADE_TUNING: UpgradeTuning = {
  maxLevel: 3,
  statMultiplierPerLevel: 0.1,
  /** Level 1 is half the part's price, level 2 the full price, level 3 one and a half. */
  costMultiplierPerLevel: 0.5,
  scaledStats: ["armor", "mobility", "accuracy", "firepower"],
};
