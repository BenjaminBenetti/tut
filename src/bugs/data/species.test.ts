import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "../../content/data/model-ids";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
import { DAMAGE_TAGS } from "../../content/model/damage-tag";
import type { BugUnitSource } from "../../tactical/model/bug-unit-source";
import { DEMOLITION_TUNING } from "../../tactical/data/demolition-tuning";
import { isMelee } from "../../tactical/model/weapon-profile";
import { BEHAVIOUR_TAGS } from "../model/bug-species";
import type { BugSpecies } from "../model/bug-species";
import type {
  ArmouredBaseId,
  ArmouredVariantId,
} from "../model/armoured-variant";
import { ARMOURED_VARIANT_TUNING } from "./armoured-variant-tuning";
import {
  ARMOURED_VARIANT_BASES,
  BRUTE,
  BRUTE_ARMOURED,
  BUG_SPECIES,
  HIVE_GUARD,
  LURKER,
  LURKER_ARMOURED,
  SPITTER,
  SWARMER,
  SWARMER_ARMOURED,
} from "./species";

/** The armoured variants beside the species each is derived from (#1179). */
const VARIANTS = [
  [SWARMER_ARMOURED, SWARMER],
  [LURKER_ARMOURED, LURKER],
  [BRUTE_ARMOURED, BRUTE],
] as const;

/** The same pairs by id, for the tables keyed by variant or by base. */
const VARIANT_IDS: readonly (readonly [ArmouredVariantId, ArmouredBaseId])[] = [
  ["swarmer-armoured", "swarmer"],
  ["lurker-armoured", "lurker"],
  ["brute-armoured", "brute"],
];

describe("bug species data", () => {
  it("defines every id exactly once, keyed by its own id", () => {
    expect(Object.keys(BUG_SPECIES).sort()).toEqual(
      [...BUG_SPECIES_IDS].sort(),
    );
    for (const id of BUG_SPECIES_IDS) {
      expect(BUG_SPECIES[id].id).toBe(id);
    }
    expect(
      [
        SWARMER,
        LURKER,
        BRUTE,
        SPITTER,
        HIVE_GUARD,
        SWARMER_ARMOURED,
        LURKER_ARMOURED,
        BRUTE_ARMOURED,
      ].map((s) => s.id),
    ).toEqual(BUG_SPECIES_IDS);
  });

  it("keeps every stat positive where it must be and in range where it is bounded", () => {
    for (const species of Object.values(BUG_SPECIES)) {
      for (const value of [species.hp, species.ap]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
      // Zero move is a rooted species, and only the guard behaviour,
      // which never plans a step, may drive one (#1179).
      expect(Number.isInteger(species.move)).toBe(true);
      expect(species.move).toBeGreaterThanOrEqual(
        species.behaviour === "guard" ? 0 : 1,
      );
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

  it("gives each species a distinct, known behaviour tag; a variant shares its base's", () => {
    // An armoured variant is the same bug under more plate (arc §8):
    // the same AI, so its base's tag. Every other species has its own.
    const variants = new Set<string>(Object.keys(ARMOURED_VARIANT_BASES));
    const tags = Object.values(BUG_SPECIES)
      .filter((s) => !variants.has(s.id))
      .map((s) => s.behaviour);
    expect(new Set(tags).size).toBe(tags.length);
    for (const species of Object.values(BUG_SPECIES)) {
      expect(BEHAVIOUR_TAGS).toContain(species.behaviour);
    }
    for (const [variant, base] of VARIANTS) {
      expect([variant.id, variant.behaviour]).toEqual([
        variant.id,
        base.behaviour,
      ]);
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
    // The Hive Guard is never rolled at all: missions place it (#1179).
    expect(HIVE_GUARD.hatchWeight).toBe(0);
    // The armoured variants, like the spitter, arrive only through the
    // bestiary's Act III and finale mixes (#1179).
    for (const [variant] of VARIANTS) {
      expect([variant.id, variant.hatchWeight]).toEqual([variant.id, 0]);
    }
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
    // The Hive Guard sits between a lurker and a brute (#1179).
    expect(HIVE_GUARD.xpValue).toBeGreaterThan(LURKER.xpValue);
    expect(HIVE_GUARD.xpValue).toBeLessThan(BRUTE.xpValue);
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
    expect(HIVE_GUARD.footprint).toBeUndefined();
    // The armoured brute is the same block under more plate (#1179).
    expect(BRUTE_ARMOURED.footprint).toBe(2);
    expect(SWARMER_ARMOURED.footprint).toBeUndefined();
    expect(LURKER_ARMOURED.footprint).toBeUndefined();
  });

  it("brings enough force to open a solid wall, since it fits through no door", () => {
    expect(BRUTE.weapon.demoForce).toBeGreaterThanOrEqual(
      DEMOLITION_TUNING.wallForce.solid,
    );
    expect(BRUTE.weapon.aoe?.radius).toBe(1);
  });
});

describe("the spitter's acid (#1179)", () => {
  it("is the one ranged bug that walks: about six tiles, so cover protects against it", () => {
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

describe("the Hive Guard's spines (#1179)", () => {
  it("is rooted: no move at all, and the guard behaviour that never asks for one", () => {
    expect(HIVE_GUARD.move).toBe(0);
    expect(HIVE_GUARD.behaviour).toBe("guard");
    expect(HIVE_GUARD.modelId).toBe("bug.hive-guard");
    for (const species of [SWARMER, LURKER, BRUTE, SPITTER]) {
      expect([species.id, species.move > 0]).toEqual([species.id, true]);
    }
  });

  it("throws spines a tile further than the spitter spits, inside a carbine's reach", () => {
    expect(isMelee(HIVE_GUARD.weapon)).toBe(false);
    expect(HIVE_GUARD.weapon.range).toBe(7);
    expect(HIVE_GUARD.weapon.range).toBeGreaterThan(SPITTER.weapon.range);
    expect(HIVE_GUARD.weapon.aoe).toBeUndefined();
  });

  it("hits moderately and takes a beating: tougher than a lurker, softer than a brute", () => {
    expect(HIVE_GUARD.weapon.damage).toBeGreaterThan(SPITTER.weapon.damage);
    expect(HIVE_GUARD.weapon.damage).toBeLessThan(LURKER.weapon.damage);
    expect(HIVE_GUARD.hp).toBeGreaterThan(LURKER.hp);
    expect(HIVE_GUARD.hp).toBeLessThan(BRUTE.hp);
    expect(HIVE_GUARD.armor).toBeGreaterThanOrEqual(1);
    expect(HIVE_GUARD.armor).toBeLessThanOrEqual(2);
  });
});

describe("damage tags (campaign arc §10.2)", () => {
  it("tags the spitter's spit acid and the Hive Guard's spines spine, and nothing else", () => {
    // A tag is what an autopsy's counter resists, so a species carries
    // one only when its autopsy plates against it.
    expect(SPITTER.weapon.tags).toEqual(["acid"]);
    expect(HIVE_GUARD.weapon.tags).toEqual(["spine"]);
    for (const species of [SWARMER, LURKER, BRUTE]) {
      expect([species.id, species.weapon.tags]).toEqual([
        species.id,
        undefined,
      ]);
    }
    for (const id of BUG_SPECIES_IDS) {
      for (const tag of BUG_SPECIES[id].weapon.tags ?? []) {
        expect(DAMAGE_TAGS, `${id} carries ${tag}`).toContain(tag);
      }
    }
  });
});

describe("the Act III armoured variants (#1179)", () => {
  /** The fields a variant takes from its own identity, not its base. */
  const OWN = [
    "id",
    "name",
    "description",
    "modelId",
    "armor",
    "hp",
    "hatchWeight",
  ] as const;

  /** A species' block without the fields a variant sets for itself. */
  function inherited(species: BugSpecies): Partial<BugSpecies> {
    const rest: Partial<BugSpecies> = { ...species };
    for (const key of OWN) delete rest[key];
    return rest;
  }

  it("names every variant's base, and every base once", () => {
    expect(ARMOURED_VARIANT_BASES).toEqual(Object.fromEntries(VARIANT_IDS));
    expect(Object.keys(ARMOURED_VARIANT_TUNING).sort()).toEqual(
      VARIANT_IDS.map(([, base]) => base).sort(),
    );
  });

  it.each(VARIANT_IDS)(
    "derives %s from %s: the base's armour and hit points plus the tuning's",
    (variantId, baseId) => {
      const variant = BUG_SPECIES[variantId];
      const base = BUG_SPECIES[baseId];
      const delta = ARMOURED_VARIANT_TUNING[baseId];
      expect(variant.armor).toBe(base.armor + delta.armor);
      expect(variant.hp).toBe(base.hp + delta.hp);
      // Everything else is the base's: move, action points, weapon,
      // sight, behaviour, footprint and kill value.
      expect(inherited(variant)).toEqual(inherited(base));
      expect(variant.id).toBe(`${base.id}-armoured`);
      expect(variant.modelId).toBe(`bug.${variant.id}`);
      expect(variant.name).toMatch(/^Armoured /);
    },
  );

  it.each(VARIANT_IDS)(
    "gives %s one or two points of plate and a little more body",
    (_, baseId) => {
      const delta = ARMOURED_VARIANT_TUNING[baseId];
      expect([1, 2]).toContain(delta.armor);
      expect(Number.isInteger(delta.hp) && delta.hp > 0).toBe(true);
      // "A little": at most a fifth of the base's hit points.
      expect(delta.hp).toBeLessThanOrEqual(BUG_SPECIES[baseId].hp / 5);
    },
  );

  it("pins today's variants, so a retune of a base shows up here as a change to its variant", () => {
    // Not a second copy of the numbers: the variants are derived, and
    // this table moves when the base species above it moves.
    expect(
      VARIANTS.map(([variant]) => [variant.id, variant.armor, variant.hp]),
    ).toEqual([
      ["swarmer-armoured", 1, 7],
      ["lurker-armoured", 2, 14],
      ["brute-armoured", 5, 36],
    ]);
  });
});
