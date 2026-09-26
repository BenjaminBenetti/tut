import { describe, expect, it } from "vitest";

import {
  ACID_RESISTANT_PLATING,
  SPINE_PLATE_ARMOUR,
} from "../data/autopsy-parts";
import { STARTER_PARTS } from "../data/parts";
import type { MechPart } from "../model/mech-part";
import { mechSystemsOf } from "./mech-system-service";

// ===========================================
// Fixtures
// ===========================================

/** A shipped part by id; throws when the catalogue lost it. */
function part(id: string): MechPart {
  const found = STARTER_PARTS.find((p) => p.id === id);
  if (!found) throw new Error(`no part ${id}`);
  return found;
}

/** The acid plating with a different resistance, for the best-of rule. */
function acidPlate(points: number): MechPart {
  return {
    ...part(ACID_RESISTANT_PLATING),
    traits: { resist: { acid: points } },
  };
}

// ===========================================
// Resistances (campaign arc §10.2)
// ===========================================

describe("mechSystemsOf resistances", () => {
  it("carries no resistance for a mech with no resisting part, as before resistances existed", () => {
    const systems = mechSystemsOf([part("utility-radiator")]);
    expect(systems).not.toHaveProperty("resist");
  });

  it("carries each fitted part's resistance, keyed by tag", () => {
    expect(
      mechSystemsOf([part("utility-radiator"), part(ACID_RESISTANT_PLATING)])
        .resist,
    ).toEqual({ acid: 3 });
    expect(
      mechSystemsOf([part(ACID_RESISTANT_PLATING), part(SPINE_PLATE_ARMOUR)])
        .resist,
    ).toEqual({ acid: 3, spine: 3 });
  });

  it("keeps the best resistance per tag rather than stacking two plates", () => {
    expect(mechSystemsOf([acidPlate(2), acidPlate(3)]).resist).toEqual({
      acid: 3,
    });
  });

  it("ignores a resistance of zero or less", () => {
    expect(mechSystemsOf([acidPlate(0)])).not.toHaveProperty("resist");
    expect(mechSystemsOf([acidPlate(-2)])).not.toHaveProperty("resist");
  });
});
