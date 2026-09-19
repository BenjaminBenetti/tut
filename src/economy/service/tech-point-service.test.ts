import { describe, expect, it } from "vitest";

import { TECH_POINTS_CHANGED } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import { TechPointTreasury } from "./tech-point-service";

const STATE: EconomyState = { credits: 100, ledger: [], techPoints: 30 };

describe("TechPointTreasury", () => {
  const treasury = new TechPointTreasury();

  it("earns into the pool, leaves credits alone and announces the movement", () => {
    const applied = treasury.earn(STATE, 12, "mission-3", 4);
    expect(applied.state).toEqual({ credits: 100, ledger: [], techPoints: 42 });
    expect(STATE.techPoints).toBe(30);
    expect(applied.events).toEqual([
      {
        type: TECH_POINTS_CHANGED,
        payload: {
          before: 30,
          after: 42,
          amount: 12,
          ref: "mission-3",
          day: 4,
        },
      },
    ]);
  });

  it("spends when affordable and refuses without change when not", () => {
    const spent = treasury.spend(STATE, 30, "tech.jump-jets", 5);
    expect(spent.ok).toBe(true);
    if (spent.ok) {
      expect(spent.value.state.techPoints).toBe(0);
      expect(spent.value.events[0]?.payload).toMatchObject({ amount: -30 });
    }
    const refused = treasury.spend(STATE, 31, "tech.jump-jets", 5);
    expect(refused).toEqual({
      ok: false,
      error: { type: "insufficient-tech-points", required: 31, available: 30 },
    });
    expect(treasury.canAfford(STATE, 30)).toBe(true);
    expect(treasury.canAfford(STATE, 31)).toBe(false);
  });

  it("rejects fractional or negative amounts as programmer errors", () => {
    expect(() => treasury.earn(STATE, 1.5, "x", 1)).toThrow(RangeError);
    expect(() => treasury.spend(STATE, -1, "x", 1)).toThrow(RangeError);
  });
});
