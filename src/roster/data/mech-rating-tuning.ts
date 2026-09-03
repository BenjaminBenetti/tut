import type { MechRatingTuning } from "../model/mech-rating-tuning";

// ===========================================
// Default values
// ===========================================

/** Rating per point of armor. Placeholder until the auto-resolver (#62) is tuned. */
export const armorWeight = 1;

/** Rating per tile of mobility. Mobility is scarce, so each tile counts for several armor points. */
export const mobilityWeight = 3;

/** Rating per percentage point of accuracy. */
export const accuracyWeight = 0.5;

/** Rating per point of firepower. Guns are what kill bugs. */
export const firepowerWeight = 2;

/** Rating lost per point of net positive heat. */
export const heatPenalty = 2;

// ===========================================
// Aggregate
// ===========================================

/**
 * The default rating weights, for injection into the loadout validation
 * service. Each weight is also exported individually.
 */
export const MECH_RATING_TUNING: MechRatingTuning = {
  armorWeight,
  mobilityWeight,
  accuracyWeight,
  firepowerWeight,
  heatPenalty,
};
