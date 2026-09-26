import { describe, expect, it } from "vitest";

import {
  ACID_RESISTANT_PLATING,
  ARMOUR_PIERCING_ROUNDS,
  MATRIARCH_CHITIN,
  SEISMIC_SENSOR,
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

// ===========================================
// Pierce and seismic range (campaign arc §10.2)
// ===========================================

describe("mechSystemsOf pierce and seismic range", () => {
  it("carries neither on a mech with no rounds and no sensor, as before they existed", () => {
    const systems = mechSystemsOf([part("utility-radiator")]);
    expect(systems).not.toHaveProperty("pierce");
    expect(systems).not.toHaveProperty("seismicRange");
  });

  it("carries the rounds' pierce and the sensor's range from the parts that give them", () => {
    expect(mechSystemsOf([part(ARMOUR_PIERCING_ROUNDS)]).pierce).toBe(2);
    expect(mechSystemsOf([part(SEISMIC_SENSOR)]).seismicRange).toBe(10);
    const both = mechSystemsOf([
      part(ARMOUR_PIERCING_ROUNDS),
      part(SEISMIC_SENSOR),
    ]);
    expect(both).toMatchObject({ pierce: 2, seismicRange: 10 });
  });

  it("keeps the best of two rather than stacking them", () => {
    const deeper = {
      ...part(SEISMIC_SENSOR),
      traits: { seismicRange: 14 },
    };
    const heavier = {
      ...part(ARMOUR_PIERCING_ROUNDS),
      traits: { pierce: 3 },
    };
    expect(mechSystemsOf([part(SEISMIC_SENSOR), deeper]).seismicRange).toBe(14);
    expect(mechSystemsOf([part(ARMOUR_PIERCING_ROUNDS), heavier]).pierce).toBe(
      3,
    );
  });

  it("gives Matriarch Chitin's two resistances together", () => {
    expect(mechSystemsOf([part(MATRIARCH_CHITIN)]).resist).toEqual({
      acid: 2,
      spine: 2,
    });
  });
});
