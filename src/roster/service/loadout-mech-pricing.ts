import type { MechLoadout } from "../model/mech-loadout";
import type { MechPricing } from "../model/mech-pricing";
import type { MechRatingTuning } from "../model/mech-rating-tuning";
import type { PartCatalogue } from "../model/part-catalogue";
import type { UpgradeTuning } from "../model/upgrade-tuning";
import { describeLoadout } from "./loadout-validation-service";

// ===========================================
// LoadoutMechPricing
// ===========================================

/**
 * `MechPricing` that reads the price off the loadout's stat sheet, so a
 * mech is valued by exactly the sum the mech bay prints and `buildMech`
 * charges with nothing in stock:
 *
 * ```
 *   price = chassis.cost + Σ part.cost + Σ cumulative upgrade cost   (the sheet's totalCost)
 * ```
 *
 * The sheet is read from `describeLoadout`, which sums it whenever every
 * part resolves, so a mech over its capacity still has a price. A
 * loadout naming a part the catalogue does not know prices at `0`
 * rather than throwing: there is nothing whole to value.
 */
export class LoadoutMechPricing implements MechPricing {
  // ===========================================
  // Fields
  // ===========================================

  private readonly catalogue: PartCatalogue;
  private readonly rating: MechRatingTuning;
  private readonly upgrades: UpgradeTuning;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Prices against the given parts and upgrade tuning.
   *
   * @param catalogue - The parts and their prices.
   * @param rating - The rating weights the sheet is summed with; the price does not read them.
   * @param upgrades - What each upgrade level costs.
   */
  constructor(
    catalogue: PartCatalogue,
    rating: MechRatingTuning,
    upgrades: UpgradeTuning,
  ) {
    this.catalogue = catalogue;
    this.rating = rating;
    this.upgrades = upgrades;
  }

  // ===========================================
  // MechPricing
  // ===========================================

  /**
   * The sheet's `totalCost`, or `0` when the loadout does not resolve.
   *
   * @param loadout - The loadout to price.
   */
  priceOf(loadout: MechLoadout): number {
    const { sheet } = describeLoadout(
      loadout,
      this.catalogue,
      this.rating,
      this.upgrades,
    );
    return sheet?.totalCost ?? 0;
  }
}
