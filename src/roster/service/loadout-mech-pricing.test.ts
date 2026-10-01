import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../data/mech-rating-tuning";
import { STARTER_PARTS } from "../data/parts";
import { STARTER_LOADOUT } from "../data/starter-roster";
import { UPGRADE_TUNING } from "../data/upgrade-tuning";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import { LoadoutMechPricing } from "./loadout-mech-pricing";
import { validateLoadout } from "./loadout-validation-service";
import { cumulativeUpgradeCost } from "./part-stat-service";

const CATALOGUE = new StaticPartCatalogue(STARTER_PARTS);
const PRICING = new LoadoutMechPricing(
  CATALOGUE,
  MECH_RATING_TUNING,
  UPGRADE_TUNING,
);

/** The catalogue price of one part, failing loudly when it is missing. */
function costOf(id: string): number {
  const part = CATALOGUE.getPart(id);
  if (part === undefined) throw new Error(`no part ${id}`);
  return part.cost;
}

describe("LoadoutMechPricing", () => {
  it("prices the starter mech at the sum of its parts", () => {
    const parts = [
      STARTER_LOADOUT.chassisId,
      STARTER_LOADOUT.legsId,
      STARTER_LOADOUT.armsId,
      STARTER_LOADOUT.armWeaponId,
      STARTER_LOADOUT.backWeaponId,
      ...STARTER_LOADOUT.utilityIds,
    ];
    const sum = parts.reduce((total, id) => total + costOf(id), 0);
    expect(PRICING.priceOf(STARTER_LOADOUT)).toBe(sum);
    // The Skirmisher's shipped price; a change here is a price change.
    expect(PRICING.priceOf(STARTER_LOADOUT)).toBe(2850);
  });

  it("adds what the upgrade levels cost", () => {
    const gun = CATALOGUE.getPart(STARTER_LOADOUT.armWeaponId);
    if (gun === undefined) throw new Error("no arm weapon");
    const upgraded = {
      ...STARTER_LOADOUT,
      upgrades: { [gun.id]: 2 },
    };
    const extra = cumulativeUpgradeCost(gun, 2, UPGRADE_TUNING);
    expect(extra).toBeGreaterThan(0);
    expect(PRICING.priceOf(upgraded)).toBe(
      PRICING.priceOf(STARTER_LOADOUT) + extra,
    );
  });

  it("prices a loadout over its capacity", () => {
    const heavy = {
      ...STARTER_LOADOUT,
      utilityIds: [
        ...STARTER_LOADOUT.utilityIds,
        ...STARTER_LOADOUT.utilityIds,
        ...STARTER_LOADOUT.utilityIds,
        ...STARTER_LOADOUT.utilityIds,
      ],
    };
    // The fixture must be over capacity, or this proves nothing.
    expect(
      validateLoadout(heavy, CATALOGUE, MECH_RATING_TUNING, UPGRADE_TUNING).ok,
    ).toBe(false);
    const extra = 3 * costOf(STARTER_LOADOUT.utilityIds[0] ?? "");
    expect(PRICING.priceOf(heavy)).toBe(
      PRICING.priceOf(STARTER_LOADOUT) + extra,
    );
  });

  it("values a loadout the catalogue cannot resolve at nothing", () => {
    expect(
      PRICING.priceOf({ ...STARTER_LOADOUT, chassisId: "chassis-unknown" }),
    ).toBe(0);
    expect(
      PRICING.priceOf({ ...STARTER_LOADOUT, legsId: "legs-unknown" }),
    ).toBe(0);
  });
});
