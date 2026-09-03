import { describe, expect, it } from "vitest";

import { COVER_LEVELS } from "../../mapgen/model/cover";
import { COMBAT_TUNING } from "./combat-tuning";

const T = COMBAT_TUNING;

describe("combat tuning", () => {
  it("keeps hit chance bounds inside the percent scale", () => {
    expect(T.minHitChance).toBeGreaterThanOrEqual(0);
    expect(T.minHitChance).toBeLessThanOrEqual(T.maxHitChance);
    expect(T.maxHitChance).toBeLessThanOrEqual(100);
  });

  it("penalises cover more the higher it is and never rewards it", () => {
    let previous = 0;
    for (const level of COVER_LEVELS) {
      expect(T.coverModifier[level]).toBeLessThanOrEqual(previous);
      previous = T.coverModifier[level];
    }
    expect(T.coverModifier[0]).toBe(0);
  });

  it("uses non-negative range, flank and elevation knobs with a cap", () => {
    expect(T.rangePenaltyPerTile).toBeGreaterThanOrEqual(0);
    expect(T.flankBonus).toBeGreaterThanOrEqual(0);
    expect(T.elevationPerLevel).toBeGreaterThanOrEqual(0);
    expect(T.maxElevationModifier).toBeGreaterThanOrEqual(T.elevationPerLevel);
  });

  it("rolls damage in a sane band and costs whole action points", () => {
    expect(T.damageSpread).toBeGreaterThanOrEqual(0);
    expect(T.damageSpread).toBeLessThan(1);
    expect(Number.isInteger(T.minDamage)).toBe(true);
    expect(T.minDamage).toBeGreaterThan(0);
    expect(Number.isInteger(T.attackApCost)).toBe(true);
    expect(T.attackApCost).toBeGreaterThan(0);
  });
});
