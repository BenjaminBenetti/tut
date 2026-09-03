import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "../../content/data/model-ids";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import { BEHAVIOUR_TAGS } from "../model/bug-species";
import { BRUTE, BUG_SPECIES, LURKER, SWARMER } from "./species";

describe("bug species data", () => {
  it("defines every id exactly once, keyed by its own id", () => {
    expect(Object.keys(BUG_SPECIES).sort()).toEqual(
      [...BUG_SPECIES_IDS].sort(),
    );
    for (const id of BUG_SPECIES_IDS) {
      expect(BUG_SPECIES[id].id).toBe(id);
    }
    expect([SWARMER, LURKER, BRUTE].map((s) => s.id)).toEqual(BUG_SPECIES_IDS);
  });

  it("keeps every stat positive where it must be and in range where it is bounded", () => {
    for (const species of Object.values(BUG_SPECIES)) {
      for (const value of [
        species.hp,
        species.move,
        species.ap,
        species.hatchWeight,
      ]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      expect(Number.isInteger(species.armor)).toBe(true);
      expect(species.armor).toBeGreaterThanOrEqual(0);
      const { weapon } = species;
      expect(Number.isInteger(weapon.range)).toBe(true);
      expect(weapon.range).toBeGreaterThan(0);
      expect(weapon.accuracy).toBeGreaterThanOrEqual(0);
      expect(weapon.accuracy).toBeLessThanOrEqual(100);
      expect(weapon.damage).toBeGreaterThan(0);
      expect(weapon.armorPen).toBeGreaterThanOrEqual(0);
      expect(species.name.trim().length).toBeGreaterThan(0);
      expect(species.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives each species a distinct, known behaviour tag", () => {
    const tags = Object.values(BUG_SPECIES).map((s) => s.behaviour);
    expect(new Set(tags).size).toBe(tags.length);
    for (const tag of tags) {
      expect(BEHAVIOUR_TAGS).toContain(tag);
    }
  });

  it("points every species at a registered bug model", () => {
    for (const species of Object.values(BUG_SPECIES)) {
      expect(MODEL_IDS).toContain(species.modelId);
      expect(species.modelId.startsWith("bug.")).toBe(true);
    }
  });

  it("orders the species by weight: swarmer light and fast, brute heavy and slow", () => {
    expect(SWARMER.hp).toBeLessThan(LURKER.hp);
    expect(LURKER.hp).toBeLessThan(BRUTE.hp);
    expect(SWARMER.move).toBeGreaterThan(BRUTE.move);
    expect(SWARMER.hatchWeight).toBeGreaterThan(BRUTE.hatchWeight);
    expect(BRUTE.weapon.armorPen).toBeGreaterThan(SWARMER.weapon.armorPen);
  });

  it("satisfies the tactical unit factory's BugUnitSource shape", () => {
    const sources: BugUnitSource[] = Object.values(BUG_SPECIES);
    expect(sources.map((s) => s.id)).toEqual(BUG_SPECIES_IDS);
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(BUG_SPECIES))).toEqual(BUG_SPECIES);
  });
});
