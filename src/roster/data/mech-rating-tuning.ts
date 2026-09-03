import type { MechRatingTuning } from "../model/mech-rating-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The default rating weights, for injection into the loadout validation
 * service. Placeholders until the auto-resolver (#62) exists to tune
 * against; the ADR 0003 §2.5 pattern keeps them in one typed object so a
 * difficulty setting or test can substitute the whole bundle.
 */
export const MECH_RATING_TUNING: MechRatingTuning = {
  /** Rating per point of armor. */
  armorWeight: 1,
  /** Rating per tile of mobility; mobility is scarce, so each tile counts for several armor points. */
  mobilityWeight: 3,
  /** Rating per percentage point of accuracy. */
  accuracyWeight: 0.5,
  /** Rating per point of firepower; guns are what kill bugs. */
  firepowerWeight: 2,
  /** Rating lost per point of net positive heat. */
  heatPenalty: 2,
};
