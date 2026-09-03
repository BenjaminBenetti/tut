import type { Mech } from "../model/mech";
import type { MechRater } from "../model/mech-rater";
import type { MechRatingTuning } from "../model/mech-rating-tuning";
import type { PartCatalogue } from "../model/part-catalogue";
import { validateLoadout } from "./loadout-validation-service";

// ===========================================
// LoadoutMechRater
// ===========================================

/**
 * `MechRater` that rates a mech by validating its loadout against the
 * part catalogue and reading the stat sheet's `combatRating`. A loadout
 * that fails validation (a part removed from the catalogue, say) rates
 * `0` rather than throwing: the mech still exists, it just cannot fight.
 */
export class LoadoutMechRater implements MechRater {
  // ===========================================
  // Fields
  // ===========================================

  private readonly catalogue: PartCatalogue;
  private readonly tuning: MechRatingTuning;

  // ===========================================
  // Construction
  // ===========================================

  /** Rates against the given parts and rating weights. */
  constructor(catalogue: PartCatalogue, tuning: MechRatingTuning) {
    this.catalogue = catalogue;
    this.tuning = tuning;
  }

  // ===========================================
  // MechRater
  // ===========================================

  /** The stat sheet's combat rating, or `0` when the loadout does not validate. */
  rateMech(mech: Mech): number {
    const sheet = validateLoadout(mech.loadout, this.catalogue, this.tuning);
    return sheet.ok ? sheet.value.combatRating : 0;
  }
}
