import { describe, expect, it } from "vitest";

import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import { MISSION_OUTCOMES } from "../model/mission-result";
import { AUTO_RESOLVE_TUNING } from "./auto-resolve-tuning";

const T = AUTO_RESOLVE_TUNING;

describe("auto-resolve tuning", () => {
  it("has positive scale and spread", () => {
    expect(T.difficultyScale).toBeGreaterThan(0);
    expect(T.winSpread).toBeGreaterThan(0);
  });

  it("keeps every probability and fraction in [0, 1]", () => {
    const values = [
      T.damagePenalty,
      T.extractChance,
      T.extractedRewardFraction,
      ...MISSION_OUTCOMES.map((o) => T.casualtyChance[o]),
      ...MISSION_OUTCOMES.map((o) => T.mechDestructionChance[o]),
    ];
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("punishes a loss more than an extraction more than a win", () => {
    expect(T.casualtyChance.won).toBeLessThan(T.casualtyChance.extracted);
    expect(T.casualtyChance.extracted).toBeLessThan(T.casualtyChance.lost);
    expect(T.mechDestructionChance.won).toBeLessThan(
      T.mechDestructionChance.extracted,
    );
    expect(T.mechDestructionChance.extracted).toBeLessThan(
      T.mechDestructionChance.lost,
    );
    expect(T.mechDamage.won.max).toBeLessThanOrEqual(
      T.mechDamage.extracted.max,
    );
    expect(T.mechDamage.extracted.max).toBeLessThanOrEqual(
      T.mechDamage.lost.max,
    );
  });

  it("uses whole, ordered damage ranges inside the mech damage scale", () => {
    for (const outcome of MISSION_OUTCOMES) {
      const { min, max } = T.mechDamage[outcome];
      expect(Number.isInteger(min), outcome).toBe(true);
      expect(Number.isInteger(max), outcome).toBe(true);
      expect(min, outcome).toBeGreaterThanOrEqual(0);
      expect(min, outcome).toBeLessThanOrEqual(max);
      expect(max, outcome).toBeLessThanOrEqual(MECH_MAX_DAMAGE);
    }
  });

  it("clears infestation on a win and adds some on a loss", () => {
    expect(Number.isInteger(T.clearanceBase)).toBe(true);
    expect(Number.isInteger(T.clearancePerDifficulty)).toBe(true);
    expect(Number.isInteger(T.lossInfestationPenalty)).toBe(true);
    expect(T.clearanceBase + T.clearancePerDifficulty).toBeGreaterThan(0);
    expect(T.lossInfestationPenalty).toBeGreaterThan(0);
  });
});
