import type { MechLoadout } from "./mech-loadout";

/**
 * Prices a mech's loadout in credits: what building it new would cost
 * with nothing in stock, which is the stat sheet's `totalCost` (chassis,
 * parts and every upgrade level). Services that value a mech depend on
 * this, not on the catalogue behind it.
 */
export interface MechPricing {
  /**
   * The loadout's price in whole credits, `>= 0`. A loadout the
   * catalogue cannot resolve is worth nothing.
   */
  priceOf(loadout: MechLoadout): number;
}
