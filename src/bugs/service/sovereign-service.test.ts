import { describe, expect, it } from "vitest";

import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { SOVEREIGN_TUNING } from "../data/sovereign-tuning";
import { SOVEREIGN } from "../data/species";
import {
  groundGap,
  isRetreating,
  isSovereign,
  SOVEREIGN_SPECIES_ID,
  sovereignHp,
} from "./sovereign-service";

describe("sovereignHp (#1179)", () => {
  it("is her species' hit points at difficulty 1 and climbs with every step, into the brief's 120–160", () => {
    expect(sovereignHp(1)).toBe(SOVEREIGN.hp);
    expect([1, 5, 8, 10].map((d) => sovereignHp(d))).toEqual([
      120, 136, 148, 156,
    ]);
    for (let d = 1; d <= 10; d++) {
      expect(sovereignHp(d)).toBeGreaterThanOrEqual(120);
      expect(sovereignHp(d)).toBeLessThanOrEqual(160);
      if (d > 1) {
        expect(sovereignHp(d)).toBeGreaterThan(sovereignHp(d - 1));
      }
    }
  });

  it("never drops below difficulty 1's value, and reads a substitute tuning", () => {
    expect(sovereignHp(0)).toBe(sovereignHp(1));
    expect(
      sovereignHp(3, { ...SOVEREIGN_TUNING, hpBase: 10, hpPerDifficulty: 5 }),
    ).toBe(20);
  });
});

describe("isSovereign and isRetreating (#1179)", () => {
  const her = {
    ...unitAt("sov", "infantry", { x: 0, y: 0, z: 0 }, { team: "bugs" }),
    sourceId: SOVEREIGN_SPECIES_ID,
    hp: 120,
    maxHp: 120,
  };

  it("knows her by species and side", () => {
    expect(isSovereign(her)).toBe(true);
    expect(isSovereign({ ...her, team: "tdf" })).toBe(false);
    expect(isSovereign({ ...her, sourceId: "brute" })).toBe(false);
  });

  it("turns at 40 % of her max hit points, not a point above, and stays turned once marked", () => {
    // 40 % of 120 is 48.
    expect(isRetreating({ ...her, hp: 49 })).toBe(false);
    expect(isRetreating({ ...her, hp: 48 })).toBe(true);
    expect(isRetreating({ ...her, hp: 120, retreating: true })).toBe(true);
    expect(isRetreating(her)).toBe(false);
  });
});

describe("groundGap (#1179)", () => {
  it("measures between the nearest tiles of two blocks, 0 when they touch or overlap", () => {
    const a = { x: 10, y: 0, z: 10 };
    // A 4×4 block covers x 10–13: a tile at x 19 is 6 tiles off its edge.
    expect(groundGap(a, 4, { x: 19, y: 0, z: 11 }, 1)).toBe(6);
    expect(groundGap(a, 4, { x: 20, y: 0, z: 11 }, 1)).toBe(7);
    expect(groundGap(a, 4, { x: 4, y: 0, z: 11 }, 1)).toBe(6);
    // Diagonal off the corner adds both axes.
    expect(groundGap(a, 4, { x: 16, y: 0, z: 16 }, 1)).toBe(6);
    // A 2×2 block beside hers.
    expect(groundGap(a, 4, { x: 14, y: 0, z: 13 }, 2)).toBe(1);
    expect(groundGap(a, 4, { x: 12, y: 0, z: 12 }, 2)).toBe(0);
    // Symmetric.
    expect(groundGap({ x: 19, y: 0, z: 11 }, 1, a, 4)).toBe(6);
  });
});
