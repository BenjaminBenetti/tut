import { describe, expect, it } from "vitest";

import { STARTER_PARTS } from "../data/parts";
import type { MechPart, PartStats } from "../model/mech-part";
import { StaticPartCatalogue } from "./static-part-catalogue";

const ZERO_STATS: PartStats = {
  armor: 0,
  mobility: 0,
  heat: 0,
  power: 0,
  accuracy: 0,
  firepower: 0,
  weight: 0,
};

/** Builds a minimal fitted part for repository tests. */
function component(id: string, slot: "legs" | "arms"): MechPart {
  return {
    id,
    name: id,
    slot,
    tier: 1,
    cost: 1,
    stats: ZERO_STATS,
    description: "",
  };
}

describe("StaticPartCatalogue", () => {
  it("finds parts by id and reports unknown ids as undefined", () => {
    const catalogue = new StaticPartCatalogue(STARTER_PARTS);
    expect(catalogue.getPart("chassis-vanguard")?.name).toBe("Vanguard");
    expect(catalogue.getPart("chassis-nope")).toBeUndefined();
  });

  it("lists parts by slot in catalogue order", () => {
    const first = component("legs-a", "legs");
    const second = component("legs-b", "legs");
    const catalogue = new StaticPartCatalogue([
      first,
      component("arms-a", "arms"),
      second,
    ]);
    expect(catalogue.partsForSlot("legs")).toEqual([first, second]);
    expect(catalogue.partsForSlot("arms").map((part) => part.id)).toEqual([
      "arms-a",
    ]);
  });

  it("returns an empty list for a slot with no parts", () => {
    const catalogue = new StaticPartCatalogue([]);
    expect(catalogue.partsForSlot("utility")).toEqual([]);
  });

  it("types chassis lookups so capacity needs no guard", () => {
    const catalogue = new StaticPartCatalogue(STARTER_PARTS);
    const chassis = catalogue.partsForSlot("chassis");
    expect(chassis.length).toBeGreaterThan(0);
    expect(chassis.every((part) => part.capacity.maxWeight > 0)).toBe(true);
  });

  it("rejects duplicate ids", () => {
    expect(
      () =>
        new StaticPartCatalogue([
          component("legs-a", "legs"),
          component("legs-a", "legs"),
        ]),
    ).toThrow(/legs-a/);
  });

  it("indexes every starter part", () => {
    const catalogue = new StaticPartCatalogue(STARTER_PARTS);
    for (const part of STARTER_PARTS) {
      expect(catalogue.getPart(part.id)).toBe(part);
    }
  });
});
