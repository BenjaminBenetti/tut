import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { DEPLOYABLE_LEVELS } from "../model/deployable-level";
import type {
  DeployableLevelSpec,
  DeployableType,
} from "../model/deployable-type";
import {
  DEPLOYABLE_EFFECT_KEYS,
  DEPLOYABLE_TYPE_IDS,
} from "../model/deployable-type";
import { INFESTATION_TUNING } from "./infestation-tuning";
import { DEPLOYABLE_TYPES } from "./deployable-types";

const ALL_TYPES: readonly DeployableType[] = DEPLOYABLE_TYPE_IDS.map(
  (id) => DEPLOYABLE_TYPES[id],
);

/** Every (type, level, spec) triple, for tests over the whole ladder. */
const ALL_SPECS: readonly [DeployableType, number, DeployableLevelSpec][] =
  ALL_TYPES.flatMap((type) =>
    DEPLOYABLE_LEVELS.map(
      (level): [DeployableType, number, DeployableLevelSpec] => [
        type,
        level,
        type.levels[level],
      ],
    ),
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

  it("defines all three levels for every type", () => {
    for (const type of ALL_TYPES) {
      expect(Object.keys(type.levels).map(Number).sort(), type.id).toEqual([
        ...DEPLOYABLE_LEVELS,
      ]);
    }
  });

  it("charges a positive whole cost and upkeep at every level, upkeep below cost", () => {
    for (const [type, level, spec] of ALL_SPECS) {
      const label = `${type.id}/L${String(level)}`;
      expect(Number.isInteger(spec.buildCost), label).toBe(true);
      expect(spec.buildCost, label).toBeGreaterThan(0);
      expect(Number.isInteger(spec.upkeepPerDay), label).toBe(true);
      expect(spec.upkeepPerDay, label).toBeGreaterThan(0);
      expect(spec.upkeepPerDay, label).toBeLessThan(spec.buildCost);
    }
  });

  it("raises upkeep with every level, so an upgrade is a running commitment", () => {
    for (const type of ALL_TYPES) {
      expect(type.levels[2].upkeepPerDay, type.id).toBeGreaterThan(
        type.levels[1].upkeepPerDay,
      );
      expect(type.levels[3].upkeepPerDay, type.id).toBeGreaterThan(
        type.levels[2].upkeepPerDay,
      );
    }
  });

  it("caps each type at a whole count of at least one per region", () => {
    for (const type of ALL_TYPES) {
      expect(Number.isInteger(type.maxPerRegion), type.id).toBe(true);
      expect(type.maxPerRegion, type.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every level at least one effect with only known keys, the same keys at every level", () => {
    for (const type of ALL_TYPES) {
      const keysAt = (level: 1 | 2 | 3): string[] =>
        Object.keys(type.levels[level].effect).sort();
      expect(keysAt(1).length, type.id).toBeGreaterThan(0);
      expect(keysAt(2), type.id).toEqual(keysAt(1));
      expect(keysAt(3), type.id).toEqual(keysAt(1));
      for (const key of keysAt(1)) {
        expect(DEPLOYABLE_EFFECT_KEYS, `${type.id}/${key}`).toContain(key);
      }
    }
  });

  it("keeps every effect value in range at every level", () => {
    for (const [type, level, spec] of ALL_SPECS) {
      const label = `${type.id}/L${String(level)}`;
      const {
        detectionFactor,
        intelBonus,
        growthFactor,
        spreadDeterrence,
        garrisonTurrets,
        incomeBonus,
      } = spec.effect;
      if (detectionFactor !== undefined) {
        expect(detectionFactor, label).toBeGreaterThan(0);
        expect(detectionFactor, label).toBeLessThan(1);
      }
      if (intelBonus !== undefined) {
        expect(Number.isInteger(intelBonus), label).toBe(true);
        expect(intelBonus, label).toBeGreaterThan(0);
      }
      if (growthFactor !== undefined) {
        expect(growthFactor, label).toBeGreaterThanOrEqual(0);
        expect(growthFactor, label).toBeLessThan(1);
      }
      if (spreadDeterrence !== undefined) {
        expect(spreadDeterrence, label).toBeGreaterThan(0);
        expect(spreadDeterrence, label).toBeLessThanOrEqual(1);
      }
      if (garrisonTurrets !== undefined) {
        expect(Number.isInteger(garrisonTurrets), label).toBe(true);
        expect(garrisonTurrets, label).toBeGreaterThan(0);
      }
      if (incomeBonus !== undefined) {
        expect(Number.isInteger(incomeBonus), label).toBe(true);
        expect(incomeBonus, label).toBeGreaterThan(0);
      }
    }
  });

  it("makes every level strictly better than the one before on every axis", () => {
    for (const type of ALL_TYPES) {
      for (const key of DEPLOYABLE_EFFECT_KEYS) {
        const values = DEPLOYABLE_LEVELS.map(
          (level) => type.levels[level].effect[key],
        );
        if (values[0] === undefined) {
          continue;
        }
        // Factors shrink as they improve; bonuses grow.
        const improving = key.endsWith("Factor");
        for (let i = 1; i < values.length; i += 1) {
          const label = `${type.id}/${key}/L${String(i + 1)}`;
          if (improving) {
            expect(values[i], label).toBeLessThan(values[i - 1] ?? Infinity);
          } else {
            expect(values[i], label).toBeGreaterThan(
              values[i - 1] ?? -Infinity,
            );
          }
        }
      }
    }
  });

  it("exercises every effect key at least once across the set", () => {
    const used = new Set(
      ALL_SPECS.flatMap(([, , spec]) => Object.keys(spec.effect)),
    );
    for (const key of DEPLOYABLE_EFFECT_KEYS) {
      expect(used.has(key), key).toBe(true);
    }
  });

  it("pays a level 1 bank back in about ten days of net income", () => {
    const bank = DEPLOYABLE_TYPES.bank.levels[1];
    const net = (bank.effect.incomeBonus ?? 0) - bank.upkeepPerDay;
    expect(net).toBeGreaterThan(0);
    const paybackDays = bank.buildCost / net;
    expect(paybackDays).toBeGreaterThanOrEqual(8);
    expect(paybackDays).toBeLessThanOrEqual(12);
    expect(bank.effect.incomeBonus).toBeLessThan(ECONOMY_TUNING.baseStipend);
  });

  it("lets a level 3 sensor find a fresh landing within a day of growth", () => {
    const factor =
      DEPLOYABLE_TYPES["sensor-array"].levels[3].effect.detectionFactor ?? 1;
    const cityThreshold = INFESTATION_TUNING.cityDetectionThreshold * factor;
    expect(cityThreshold).toBeLessThanOrEqual(
      INFESTATION_TUNING.seedAmount + INFESTATION_TUNING.baseGrowthRate,
    );
  });

  it("round-trips through JSON unchanged", () => {
    const text = JSON.stringify(DEPLOYABLE_TYPES);
    expect(JSON.parse(text)).toEqual(DEPLOYABLE_TYPES);
  });
});
