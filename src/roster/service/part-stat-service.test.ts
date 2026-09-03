import { describe, expect, it } from "vitest";

import type { ComponentPart, PartStats } from "../model/mech-part";
import type { UpgradeTuning } from "../model/upgrade-tuning";
import {
  cumulativeUpgradeCost,
  effectivePartStats,
  sumPartStats,
  upgradeCost,
  ZERO_PART_STATS,
} from "./part-stat-service";

const TUNING: UpgradeTuning = {
  maxLevel: 3,
  statMultiplierPerLevel: 0.1,
  costMultiplierPerLevel: 0.5,
  scaledStats: ["armor", "mobility", "accuracy", "firepower"],
};

const STATS: PartStats = {
  armor: 5,
  mobility: -1,
  heat: 2,
  power: -4,
  accuracy: 3,
  firepower: 18,
  weight: 8,
};

const PART: ComponentPart = {
  id: "arm-weapon-test",
  name: "Test Gun",
  slot: "arm-weapon",
  tier: 1,
  cost: 500,
  stats: STATS,
  description: "",
};

describe("effectivePartStats", () => {
  it("returns the catalogue stats unchanged at level 0", () => {
    expect(effectivePartStats(PART, 0, TUNING)).toBe(STATS);
  });

  it("scales positive scaled stats by 10 % per level, rounded, and leaves the rest", () => {
    expect(effectivePartStats(PART, 2, TUNING)).toEqual({
      armor: 6, // 5 × 1.2 = 6
      mobility: -1, // negative: never scaled
      heat: 2,
      power: -4,
      accuracy: 4, // 3 × 1.2 = 3.6 → 4
      firepower: 22, // 18 × 1.2 = 21.6 → 22
      weight: 8,
    });
  });

  it("clamps the level to maxLevel and floors fractions", () => {
    expect(effectivePartStats(PART, 9, TUNING)).toEqual(
      effectivePartStats(PART, 3, TUNING),
    );
    expect(effectivePartStats(PART, 1.9, TUNING)).toEqual(
      effectivePartStats(PART, 1, TUNING),
    );
    expect(effectivePartStats(PART, -2, TUNING)).toBe(STATS);
  });

  it("never mutates the catalogue stats", () => {
    const copy = { ...STATS };
    effectivePartStats(PART, 3, TUNING);
    expect(STATS).toEqual(copy);
  });
});

describe("upgradeCost and cumulativeUpgradeCost", () => {
  it("prices each level at cost × multiplier × level", () => {
    expect(upgradeCost(PART, 0, TUNING)).toBe(0);
    expect(upgradeCost(PART, 1, TUNING)).toBe(250);
    expect(upgradeCost(PART, 2, TUNING)).toBe(500);
    expect(upgradeCost(PART, 3, TUNING)).toBe(750);
  });

  it("sums the steps up to the clamped level", () => {
    expect(cumulativeUpgradeCost(PART, 0, TUNING)).toBe(0);
    expect(cumulativeUpgradeCost(PART, 2, TUNING)).toBe(750);
    expect(cumulativeUpgradeCost(PART, 3, TUNING)).toBe(1500);
    expect(cumulativeUpgradeCost(PART, 7, TUNING)).toBe(1500);
  });
});

describe("sumPartStats", () => {
  it("returns zeros for no blocks", () => {
    expect(sumPartStats([])).toEqual(ZERO_PART_STATS);
  });

  it("adds every field, keeping negative deltas", () => {
    expect(sumPartStats([STATS, STATS, ZERO_PART_STATS])).toEqual({
      armor: 10,
      mobility: -2,
      heat: 4,
      power: -8,
      accuracy: 6,
      firepower: 36,
      weight: 16,
    });
  });
});
