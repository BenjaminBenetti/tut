import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "../../content/data/model-ids";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import { DEMOLITION_TUNING } from "../../tactical/data/demolition-tuning";
import { isMelee } from "../../tactical/model/weapon-profile";
import { BEHAVIOUR_TAGS } from "../model/bug-species";
import { BRUTE, BUG_SPECIES, LURKER, SPITTER, SWARMER } from "./species";

describe("bug species data", () => {
  it("defines every id exactly once, keyed by its own id", () => {
    expect(Object.keys(BUG_SPECIES).sort()).toEqual(
      [...BUG_SPECIES_IDS].sort(),
    );
    for (const id of BUG_SPECIES_IDS) {
      expect(BUG_SPECIES[id].id).toBe(id);
    }
    expect([SWARMER, LURKER, BRUTE, SPITTER].map((s) => s.id)).toEqual(
      BUG_SPECIES_IDS,
    );
  });

  it("keeps every stat positive where it must be and in range where it is bounded", () => {
    for (const species of Object.values(BUG_SPECIES)) {
      for (const value of [species.hp, species.move, species.ap]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      // Zero is a weight: a species the default roll never produces
      // (see "rolls only the species with a weight above 0").
      expect(Number.isInteger(species.hatchWeight)).toBe(true);
      expect(species.hatchWeight).toBeGreaterThanOrEqual(0);
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

  it("rolls only the species with a weight above 0: the spitter waits for the bestiary (#1179)", () => {
    // Egg spawners and edge waves roll the species whose hatchWeight is
    // above 0 (`placeBugs` in tactical/service/spawn-service filters the
    // rest out). The spitter ships at 0 so that today's missions and the
    // pinned tactical sims do not change; the campaign's bestiary mixes
    // it in from mission 8 through a per-mission species mix. When that
    // lands this list is still the default roll, and it should still be
    // these three.
    const rolled = Object.values(BUG_SPECIES)
      .filter((s) => s.hatchWeight > 0)
      .map((s) => s.id);
    expect(rolled).toEqual(["swarmer", "lurker", "brute"]);
    expect(SPITTER.hatchWeight).toBe(0);
    // The default mix itself is unchanged: six to three to one.
    expect([SWARMER, LURKER, BRUTE].map((s) => s.hatchWeight)).toEqual([
      6, 3, 1,
    ]);
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
    // The spitter is fragile: above a swarmer, below a lurker (#1179).
    expect(SPITTER.hp).toBeGreaterThan(SWARMER.hp);
    expect(SPITTER.hp).toBeLessThan(LURKER.hp);
    expect(SWARMER.move).toBeGreaterThan(BRUTE.move);
    expect(SWARMER.hatchWeight).toBeGreaterThan(BRUTE.hatchWeight);
    expect(BRUTE.weapon.armorPen).toBeGreaterThan(SWARMER.weapon.armorPen);
  });

  it("prices a kill by weight: a swarmer is the unit, a brute is worth the most (#1130)", () => {
    expect(SWARMER.xpValue).toBe(10);
    expect(SWARMER.xpValue).toBeLessThan(LURKER.xpValue);
    expect(LURKER.xpValue).toBeLessThan(BRUTE.xpValue);
    expect(SPITTER.xpValue).toBeGreaterThan(SWARMER.xpValue);
    expect(SPITTER.xpValue).toBeLessThan(LURKER.xpValue);
    for (const species of Object.values(BUG_SPECIES)) {
      expect(Number.isInteger(species.xpValue) && species.xpValue > 0).toBe(
        true,
      );
    }
  });

  it("satisfies the tactical unit factory's BugUnitSource shape", () => {
    const sources: BugUnitSource[] = Object.values(BUG_SPECIES);
    expect(sources.map((s) => s.id)).toEqual(BUG_SPECIES_IDS);
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(BUG_SPECIES))).toEqual(BUG_SPECIES);
  });

  it("gives every species eyes at least as long as its bite (ADR 0006)", () => {
    // Same rule as the TDF tuning: a bug that could bite further than it
    // sees would be refused overwatch reactions it is entitled to.
    for (const species of Object.values(BUG_SPECIES)) {
      expect([species.id, species.sightRange >= species.weapon.range]).toEqual([
        species.id,
        true,
      ]);
    }
  });
});

describe("the brute's block and cleavers (#1130)", () => {
  it("stands on a 2×2 block while the small species take one tile", () => {
    expect(BRUTE.footprint).toBe(2);
    expect(SWARMER.footprint).toBeUndefined();
    expect(LURKER.footprint).toBeUndefined();
    expect(SPITTER.footprint).toBeUndefined();
  });

  it("brings enough force to open a solid wall, since it fits through no door", () => {
    expect(BRUTE.weapon.demoForce).toBeGreaterThanOrEqual(
      DEMOLITION_TUNING.wallForce.solid,
    );
    expect(BRUTE.weapon.aoe?.radius).toBe(1);
  });
});

describe("the spitter's acid (#1179)", () => {
  it("is the one ranged bug: about six tiles, so cover protects against it", () => {
    // Melee ignores cover (#446); a ranged weapon does not. The spitter
    // is the first bug a squad in cover is safer from.
    expect(isMelee(SPITTER.weapon)).toBe(false);
    expect(SPITTER.weapon.range).toBe(6);
    for (const species of [SWARMER, LURKER, BRUTE]) {
      expect([species.id, isMelee(species.weapon)]).toEqual([species.id, true]);
    }
  });

  it("hits moderately: harder than a swarmer's bite, softer than a lurker's", () => {
    expect(SPITTER.weapon.damage).toBeGreaterThan(SWARMER.weapon.damage);
    expect(SPITTER.weapon.damage).toBeLessThan(LURKER.weapon.damage);
    expect(SPITTER.weapon.aoe).toBeUndefined();
  });

  it("walks at a squad's pace and snipes", () => {
    expect(SPITTER.move).toBeLessThan(SWARMER.move);
    expect(SPITTER.move).toBeGreaterThan(BRUTE.move);
    expect(SPITTER.behaviour).toBe("snipe");
    expect(SPITTER.modelId).toBe("bug.spitter");
  });
});
