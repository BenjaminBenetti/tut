import { describe, expect, it } from "vitest";

import { SPREAD_HELD } from "../model/spread-held-event";
import {
  holdSpread,
  nextSpreadDay,
  spreadCooldownOf,
} from "./spread-cooldown-service";
import { fixtureState } from "./missions/mission-fixtures.test-helper";

describe("spreadCooldownOf", () => {
  it("reads a city's stored cooldown, and 0 for one off cooldown", () => {
    expect(spreadCooldownOf({ mid: 3 }, "mid")).toBe(3);
    expect(spreadCooldownOf({ mid: 3 }, "full")).toBe(0);
  });
});

describe("nextSpreadDay", () => {
  it("is the next day off cooldown, and day + cooldown on one", () => {
    expect(nextSpreadDay({}, "mid", 10)).toBe(11);
    expect(nextSpreadDay({ mid: 1 }, "mid", 10)).toBe(11);
    expect(nextSpreadDay({ mid: 2 }, "mid", 10)).toBe(12);
    expect(nextSpreadDay({ mid: 5 }, "mid", 10)).toBe(15);
  });
});

describe("holdSpread", () => {
  it("sets the cooldown and says so", () => {
    const state = fixtureState({ spreadCooldowns: { mid: 2 } });
    const held = holdSpread(state, "mid", 10);
    expect(held.state.spreadCooldowns).toEqual({ mid: 10 });
    expect(held.events).toEqual([
      { type: SPREAD_HELD, payload: { cityId: "mid", days: 10 } },
    ]);
  });

  it("never shortens a longer wait, and leaves other cities alone", () => {
    const state = fixtureState({ spreadCooldowns: { mid: 12, full: 1 } });
    const held = holdSpread(state, "mid", 10);
    expect(held.state).toBe(state);
    expect(held.events).toEqual([]);
    expect(holdSpread(state, "full", 10).state.spreadCooldowns).toEqual({
      mid: 12,
      full: 10,
    });
  });

  it("ignores an unknown city and rejects a hold that is not a positive integer", () => {
    const state = fixtureState();
    expect(holdSpread(state, "atlantis", 10).state).toBe(state);
    expect(() => holdSpread(state, "mid", 0)).toThrow(RangeError);
    expect(() => holdSpread(state, "mid", 2.5)).toThrow(RangeError);
  });
});
