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
    expect(T.elevationPerStorey).toBeGreaterThanOrEqual(0);
    expect(T.maxElevationModifier).toBeGreaterThanOrEqual(T.elevationPerStorey);
  });

  it("lets height buy reach, and more than it costs in distance (#1119)", () => {
    expect(T.reachBonusPerStorey).toBeGreaterThanOrEqual(0);
    expect(T.maxReachBonus).toBeGreaterThanOrEqual(T.reachBonusPerStorey);
    // A storey is 1.5 tiles tall; a bonus below that would make high
    // ground a net loss of reach against the ground.
    expect(T.reachBonusPerStorey).toBeGreaterThanOrEqual(1.5);
  });

  it("steadies a shot at the ground without making it certain (#1121)", () => {
    expect(T.groundShotBonus).toBeGreaterThanOrEqual(0);
    // The starter mortar (accuracy 60 after its own −10) at ten tiles:
    // more likely to land than not, which is what the Executive
    // Director asked for after five misses in a row.
    expect(60 + T.groundShotBonus - T.rangePenaltyPerTile * 9).toBeGreaterThan(
      50,
    );
    // And at its full sixteen tiles, still not a certainty.
    expect(60 + T.groundShotBonus - T.rangePenaltyPerTile * 15).toBeLessThan(
      T.maxHitChance,
    );
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
