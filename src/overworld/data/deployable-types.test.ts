import { describe, expect, it } from "vitest";

import type { DeployableType } from "../model/deployable-type";
import {
  DEPLOYABLE_EFFECT_KEYS,
  DEPLOYABLE_TYPE_IDS,
} from "../model/deployable-type";
import { DEPLOYABLE_TYPES } from "./deployable-types";

const ALL_TYPES: readonly DeployableType[] = DEPLOYABLE_TYPE_IDS.map(
  (id) => DEPLOYABLE_TYPES[id],
);

describe("deployable-types data", () => {
  it("defines every deployable type id exactly once, keyed by its own id", () => {
    const keys = Object.keys(DEPLOYABLE_TYPES).sort();
    expect(keys).toEqual([...DEPLOYABLE_TYPE_IDS].sort());
    for (const id of DEPLOYABLE_TYPE_IDS) {
      expect(DEPLOYABLE_TYPES[id].id).toBe(id);
    }
  });

  it("has non-empty, unique names and non-empty descriptions", () => {
    const names = ALL_TYPES.map((type) => type.name.trim());
    expect(new Set(names).size).toBe(names.length);
    for (const type of ALL_TYPES) {
      expect(type.name.trim().length, type.id).toBeGreaterThan(0);
      expect(type.description.trim().length, type.id).toBeGreaterThan(0);
    }
  });

  it("charges a positive whole build cost and upkeep", () => {
    for (const type of ALL_TYPES) {
      expect(Number.isInteger(type.buildCost), type.id).toBe(true);
      expect(type.buildCost, type.id).toBeGreaterThan(0);
      expect(Number.isInteger(type.upkeepPerDay), type.id).toBe(true);
      expect(type.upkeepPerDay, type.id).toBeGreaterThan(0);
      expect(type.upkeepPerDay, type.id).toBeLessThan(type.buildCost);
    }
  });

  it("caps each type at a whole count of at least one per region", () => {
    for (const type of ALL_TYPES) {
      expect(Number.isInteger(type.maxPerRegion), type.id).toBe(true);
      expect(type.maxPerRegion, type.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every type at least one effect with only known keys", () => {
    for (const type of ALL_TYPES) {
      const keys = Object.keys(type.effect);
      expect(keys.length, type.id).toBeGreaterThan(0);
      for (const key of keys) {
        expect(DEPLOYABLE_EFFECT_KEYS, `${type.id}/${key}`).toContain(key);
      }
    }
  });

  it("keeps every effect value positive and in range", () => {
    for (const type of ALL_TYPES) {
      const { suppression, spreadDeterrence, intelBonus } = type.effect;
      if (suppression !== undefined) {
        expect(Number.isFinite(suppression), type.id).toBe(true);
        expect(suppression, type.id).toBeGreaterThan(0);
      }
      if (spreadDeterrence !== undefined) {
        expect(spreadDeterrence, type.id).toBeGreaterThan(0);
        expect(spreadDeterrence, type.id).toBeLessThanOrEqual(1);
      }
      if (intelBonus !== undefined) {
        expect(Number.isInteger(intelBonus), type.id).toBe(true);
        expect(intelBonus, type.id).toBeGreaterThan(0);
      }
    }
  });

  it("exercises every effect key at least once across the starter set", () => {
    const used = new Set(ALL_TYPES.flatMap((type) => Object.keys(type.effect)));
    for (const key of DEPLOYABLE_EFFECT_KEYS) {
      expect(used.has(key), key).toBe(true);
    }
  });

  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(DEPLOYABLE_TYPES);
    expect(JSON.parse(text)).toEqual(DEPLOYABLE_TYPES);
  });
});
