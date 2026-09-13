import { describe, expect, it } from "vitest";

import { RANK_TUNING } from "./rank-tuning";
import { RANKS } from "./ranks";

describe("ranks data", () => {
  it("starts at zero experience and rises strictly, with unique ids and names", () => {
    expect(RANKS[0]?.xp).toBe(0);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i]!.xp).toBeGreaterThan(RANKS[i - 1]!.xp);
    }
    expect(new Set(RANKS.map((r) => r.id)).size).toBe(RANKS.length);
    expect(new Set(RANKS.map((r) => r.name)).size).toBe(RANKS.length);
  });

  it("costs one more swarmer per rung than the last (#1130)", () => {
    const swarmer = 10;
    const steps = RANKS.slice(1).map((rank, i) => rank.xp - RANKS[i]!.xp);
    expect(steps).toEqual(steps.map((_, i) => (i + 1) * swarmer));
  });

  it("is the ladder the tuning ships, with non-negative rates", () => {
    expect(RANK_TUNING.ladder).toBe(RANKS);
    for (const rate of Object.values(RANK_TUNING.bonuses)) {
      expect(rate).toBeGreaterThanOrEqual(0);
    }
  });

  it("round-trips through JSON unchanged", () => {
    expect(JSON.parse(JSON.stringify(RANKS))).toEqual(RANKS);
  });
});
