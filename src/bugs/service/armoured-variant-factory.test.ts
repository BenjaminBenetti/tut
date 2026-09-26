import { describe, expect, it } from "vitest";

import { SWARMER } from "../data/species";
import type { ArmouredVariantIdentity } from "../model/armoured-variant";
import type { BugSpecies } from "../model/bug-species";
import { armouredVariant } from "./armoured-variant-factory";

const IDENTITY: ArmouredVariantIdentity = {
  id: "swarmer-armoured",
  name: "Armoured Swarmer",
  description: "A test variant.",
  modelId: "bug.swarmer-armoured",
};

describe("armouredVariant (#1179)", () => {
  it("adds the delta's armour and hit points to the base, under the variant's identity", () => {
    const variant = armouredVariant(SWARMER, IDENTITY, { armor: 2, hp: 3 });
    expect(variant).toEqual({
      ...SWARMER,
      ...IDENTITY,
      armor: SWARMER.armor + 2,
      hp: SWARMER.hp + 3,
      hatchWeight: 0,
    });
  });

  it("carries a retuned base straight through: the variant is derived, not copied", () => {
    const retuned: BugSpecies = {
      ...SWARMER,
      hp: 40,
      armor: 4,
      move: 3,
      ap: 3,
      sightRange: 5,
      xpValue: 25,
      weapon: { ...SWARMER.weapon, damage: 9, armorPen: 2 },
    };
    const variant = armouredVariant(retuned, IDENTITY, { armor: 1, hp: 1 });
    expect(variant.hp).toBe(41);
    expect(variant.armor).toBe(5);
    expect(variant.move).toBe(3);
    expect(variant.ap).toBe(3);
    expect(variant.sightRange).toBe(5);
    expect(variant.xpValue).toBe(25);
    expect(variant.weapon).toEqual(retuned.weapon);
    expect(variant.behaviour).toBe(retuned.behaviour);
  });

  it("is never rolled by default, whatever the base's hatch weight", () => {
    expect(SWARMER.hatchWeight).toBeGreaterThan(0);
    expect(
      armouredVariant(SWARMER, IDENTITY, { armor: 1, hp: 1 }).hatchWeight,
    ).toBe(0);
  });

  it("keeps the base's footprint, so a 2×2 brute's variant stays 2×2", () => {
    const block: BugSpecies = { ...SWARMER, footprint: 2 };
    expect(
      armouredVariant(block, IDENTITY, { armor: 1, hp: 1 }).footprint,
    ).toBe(2);
  });

  it("leaves the base untouched", () => {
    const base: BugSpecies = Object.freeze({ ...SWARMER });
    const before = JSON.stringify(base);
    armouredVariant(base, IDENTITY, { armor: 1, hp: 1 });
    expect(JSON.stringify(base)).toBe(before);
  });
});
