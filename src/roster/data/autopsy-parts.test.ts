import { describe, expect, it } from "vitest";

import { DAMAGE_TAGS } from "../../content/model/damage-tag";
import {
  ARMOUR_PIERCING_ROUNDS,
  AUTOPSY_PARTS,
  MATRIARCH_CHITIN,
  SEISMIC_SENSOR,
} from "./autopsy-parts";
import { STARTER_PARTS } from "./parts";

describe("AUTOPSY_PARTS (campaign arc §10.2)", () => {
  it("sells every counter in the part catalogue, above tier 1 so research gates it", () => {
    for (const part of AUTOPSY_PARTS) {
      expect(STARTER_PARTS, part.id).toContain(part);
      expect(part.tier, part.id).toBeGreaterThan(1);
    }
  });

  it("counters with each: a resisted damage tag, a pierce or a seismic range", () => {
    for (const part of AUTOPSY_PARTS) {
      const traits = part.traits ?? {};
      const counters = [
        Object.keys(traits.resist ?? {}).length > 0,
        (traits.pierce ?? 0) > 0,
        (traits.seismicRange ?? 0) > 0,
      ].filter(Boolean);
      expect(counters.length, part.id).toBeGreaterThan(0);
    }
  });

  it("resists only real damage tags, by whole positive points", () => {
    for (const part of AUTOPSY_PARTS) {
      for (const [tag, points] of Object.entries(part.traits?.resist ?? {})) {
        expect(DAMAGE_TAGS, part.id).toContain(tag);
        expect(Number.isInteger(points) && points > 0, part.id).toBe(true);
      }
    }
  });

  it("gives the Seismic Sensor a burrower's phase of digging as its range", () => {
    // A burrower tunnels 2 AP × move 5 = 10 columns a phase.
    expect(partOf(SEISMIC_SENSOR).traits).toEqual({ seismicRange: 10 });
    expect(partOf(SEISMIC_SENSOR).slot).toBe("utility");
  });

  it("gives Armour-Piercing Rounds 2 pierce, the armoured brute's extra plate", () => {
    expect(partOf(ARMOUR_PIERCING_ROUNDS).traits).toEqual({ pierce: 2 });
    expect(partOf(ARMOUR_PIERCING_ROUNDS).slot).toBe("utility");
  });

  it("makes Matriarch Chitin proof against both of her brood's hits", () => {
    expect(partOf(MATRIARCH_CHITIN).traits).toEqual({
      resist: { acid: 2, spine: 2 },
    });
    expect(partOf(MATRIARCH_CHITIN).tier).toBe(3);
  });
});

/** The autopsy part by id. */
function partOf(id: string): (typeof AUTOPSY_PARTS)[number] {
  const part = AUTOPSY_PARTS.find((each) => each.id === id);
  if (part === undefined) {
    throw new Error(`no autopsy part ${id}`);
  }
  return part;
}
