import { describe, expect, it } from "vitest";

import {
  ARMOUR_PIERCING_ROUNDS,
  AUTOPSY_PARTS,
  MATRIARCH_CHITIN,
  SEISMIC_SENSOR,
} from "../../roster/data/autopsy-parts";
import { counterTraitText } from "./counter-trait-text";

/** The shipped autopsy part's traits. */
const traitsOf = (id: string): (typeof AUTOPSY_PARTS)[number]["traits"] =>
  AUTOPSY_PARTS.find((part) => part.id === id)?.traits;

describe("counterTraitText (campaign arc §10.2)", () => {
  it("says what each W6 counter does, as the tech tree and the bay print it", () => {
    expect(counterTraitText(traitsOf(SEISMIC_SENSOR))).toEqual([
      "reveals burrowed bugs within 10",
    ]);
    expect(counterTraitText(traitsOf(ARMOUR_PIERCING_ROUNDS))).toEqual([
      "pierces 2 armour",
    ]);
    expect(counterTraitText(traitsOf(MATRIARCH_CHITIN))).toEqual([
      "acid resist 2",
      "spine resist 2",
    ]);
  });

  it("lists resistances, then pierce, then the sensor, on a mech that has them all", () => {
    expect(
      counterTraitText({ seismicRange: 10, pierce: 2, resist: { acid: 3 } }),
    ).toEqual([
      "acid resist 3",
      "pierces 2 armour",
      "reveals burrowed bugs within 10",
    ]);
  });

  it("says nothing for no counter, or a counter of zero", () => {
    expect(counterTraitText(undefined)).toEqual([]);
    expect(counterTraitText({})).toEqual([]);
    expect(counterTraitText({ pierce: 0, seismicRange: 0 })).toEqual([]);
  });
});
