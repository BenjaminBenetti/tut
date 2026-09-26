import { describe, expect, it } from "vitest";

import type { Hive } from "./hive";
import { hiveLevel } from "./hive";

const HIVE: Hive = { id: "hive-1", regionId: "east-asia", formedDay: 30 };
const WEEKLY = { difficultyStepDays: 7 };

describe("hiveLevel", () => {
  it("is 0 when the hive forms and through its first six days", () => {
    for (const day of [30, 31, 36]) {
      expect(hiveLevel(HIVE, day, WEEKLY)).toBe(0);
    }
  });

  it("steps up at days 7 and 14 after forming", () => {
    expect(hiveLevel(HIVE, 36, WEEKLY)).toBe(0);
    expect(hiveLevel(HIVE, 37, WEEKLY)).toBe(1);
    expect(hiveLevel(HIVE, 43, WEEKLY)).toBe(1);
    expect(hiveLevel(HIVE, 44, WEEKLY)).toBe(2);
    expect(hiveLevel(HIVE, 51, WEEKLY)).toBe(3);
  });

  it("follows the tuned step length", () => {
    expect(hiveLevel(HIVE, 40, { difficultyStepDays: 5 })).toBe(2);
  });

  it("never reads below 0 for a day before the hive formed", () => {
    expect(hiveLevel(HIVE, 1, WEEKLY)).toBe(0);
  });
});
