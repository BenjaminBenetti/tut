import { describe, expect, it } from "vitest";

import { RANK_TUNING } from "../data/rank-tuning";
import { RANKS } from "../data/ranks";
import type { RankLadder } from "../model/rank";
import {
  nextRank,
  promotionBetween,
  rankBonuses,
  rankIndexOf,
  rankOf,
  xpToNextRank,
} from "./rank-service";

// ===========================================
// Fixtures
// ===========================================

/** Three rungs, so the tests read without counting to nine. */
const SHORT: RankLadder = [
  { id: "a", name: "A", xp: 0 },
  { id: "b", name: "B", xp: 10 },
  { id: "c", name: "C", xp: 30 },
];

// ===========================================
// Ladder
// ===========================================

describe("rankIndexOf / rankOf", () => {
  it("is the last rung at or below the experience", () => {
    expect(rankIndexOf(0, SHORT)).toBe(0);
    expect(rankIndexOf(9, SHORT)).toBe(0);
    expect(rankIndexOf(10, SHORT)).toBe(1);
    expect(rankIndexOf(29, SHORT)).toBe(1);
    expect(rankIndexOf(30, SHORT)).toBe(2);
    expect(rankIndexOf(999, SHORT)).toBe(2);
    expect(rankOf(29, SHORT)?.name).toBe("B");
  });

  it("never leaves a unit rankless, even below the first rung or on an empty ladder", () => {
    expect(rankIndexOf(-5, SHORT)).toBe(0);
    expect(rankIndexOf(50, [])).toBe(0);
    expect(rankOf(50, [])).toBeUndefined();
  });
});

describe("nextRank / xpToNextRank", () => {
  it("names the rung above and how far it is", () => {
    expect(nextRank(0, SHORT)?.name).toBe("B");
    expect(xpToNextRank(0, SHORT)).toBe(10);
    expect(xpToNextRank(25, SHORT)).toBe(5);
  });

  it("has nothing above the top rung", () => {
    expect(nextRank(30, SHORT)).toBeUndefined();
    expect(xpToNextRank(45, SHORT)).toBeUndefined();
  });
});

describe("promotionBetween", () => {
  it("is the rank reached when the experience crosses a rung", () => {
    expect(promotionBetween(0, 10, SHORT)?.id).toBe("b");
    // Two rungs in one mission: the rank it ended on.
    expect(promotionBetween(0, 30, SHORT)?.id).toBe("c");
  });

  it("is nothing when the rung did not change", () => {
    expect(promotionBetween(10, 29, SHORT)).toBeUndefined();
    expect(promotionBetween(30, 300, SHORT)).toBeUndefined();
  });
});

// ===========================================
// Bonuses
// ===========================================

describe("rankBonuses", () => {
  const rates = RANK_TUNING.bonuses;

  it("pins the Executive Director's curve on the shipped ladder (#1130)", () => {
    // Rank 0: a green unit fights on the template alone.
    expect(rankBonuses(0, rates)).toEqual({ move: 0, accuracy: 0, ap: 0 });
    // Rank 2 (30 xp, three swarmers): one extra tile of move.
    expect(rankBonuses(2, rates)).toEqual({ move: 1, accuracy: 4, ap: 0 });
    // Rank 4 (100 xp, ten swarmers): one extra action point.
    expect(rankBonuses(4, rates)).toEqual({ move: 2, accuracy: 8, ap: 1 });
    // Rank 8, the top: still short of doubling anything.
    expect(rankBonuses(8, rates)).toEqual({ move: 4, accuracy: 16, ap: 2 });
  });

  it("floors every bonus so a half tile or a quarter action never reaches the rules", () => {
    expect(rankBonuses(1, rates)).toEqual({ move: 0, accuracy: 2, ap: 0 });
    expect(rankBonuses(3, rates)).toEqual({ move: 1, accuracy: 6, ap: 0 });
    for (const bonus of Object.values(rankBonuses(7, rates))) {
      expect(Number.isInteger(bonus)).toBe(true);
    }
  });

  it("treats a negative or fractional index as the rung below it", () => {
    expect(rankBonuses(-3, rates)).toEqual({ move: 0, accuracy: 0, ap: 0 });
    expect(rankBonuses(2.9, rates)).toEqual(rankBonuses(2, rates));
  });
});

// ===========================================
// Shipped ladder, end to end
// ===========================================

describe("shipped ladder", () => {
  it("promotes on the first swarmer, buys a tile on the third and an action on the tenth", () => {
    const swarmer = 10;
    expect(rankIndexOf(0, RANKS)).toBe(0);
    expect(rankIndexOf(swarmer, RANKS)).toBe(1);
    expect(
      rankBonuses(rankIndexOf(3 * swarmer, RANKS), RANK_TUNING.bonuses).move,
    ).toBe(1);
    expect(
      rankBonuses(rankIndexOf(9 * swarmer, RANKS), RANK_TUNING.bonuses).ap,
    ).toBe(0);
    expect(
      rankBonuses(rankIndexOf(10 * swarmer, RANKS), RANK_TUNING.bonuses).ap,
    ).toBe(1);
  });
});
