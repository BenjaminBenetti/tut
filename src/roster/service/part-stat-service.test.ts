import { describe, expect, it } from "vitest";

import type { ComponentPart, PartStats } from "../model/mech-part";
import {
  effectivePartStats,
  sumPartStats,
  ZERO_PART_STATS,
} from "./part-stat-service";

const STATS: PartStats = {
  armor: 5,
  mobility: -1,
  heat: 2,
  power: -4,
  accuracy: 3,
  firepower: 10,
  weight: 8,
};

const PART: ComponentPart = {
  id: "arm-weapon-test",
  name: "Test Gun",
  slot: "arm-weapon",
  tier: 1,
  cost: 100,
  stats: STATS,
  description: "",
};

describe("effectivePartStats", () => {
  it("returns the catalogue stats unchanged at level 0", () => {
    expect(effectivePartStats(PART)).toEqual(STATS);
    expect(effectivePartStats(PART, 0)).toEqual(STATS);
  });

  it("ignores upgrade levels until the upgrade issue lands", () => {
    expect(effectivePartStats(PART, 3)).toEqual(STATS);
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
      firepower: 20,
      weight: 16,
    });
  });

  it("never mutates its inputs or the zero block", () => {
    const copy = { ...STATS };
    sumPartStats([STATS]);
    expect(STATS).toEqual(copy);
    expect(ZERO_PART_STATS.armor).toBe(0);
  });
});
