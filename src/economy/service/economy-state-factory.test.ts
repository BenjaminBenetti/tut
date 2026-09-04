import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "../data/economy-tuning";
import type { EconomyState } from "../model/economy-state";
import { createInitialEconomyState } from "./economy-state-factory";

describe("createInitialEconomyState", () => {
  it("starts with the given credits and an empty ledger", () => {
    const state = createInitialEconomyState(1234);
    expect(state).toEqual({ credits: 1234, ledger: [] });
  });

  it("accepts the default tuning value and zero", () => {
    expect(
      createInitialEconomyState(ECONOMY_TUNING.startingCredits).credits,
    ).toBe(ECONOMY_TUNING.startingCredits);
    expect(createInitialEconomyState(0)).toEqual({ credits: 0, ledger: [] });
  });

  it("is deterministic and JSON-serializable", () => {
    const a = createInitialEconomyState(ECONOMY_TUNING.startingCredits);
    const b = createInitialEconomyState(ECONOMY_TUNING.startingCredits);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(JSON.parse(JSON.stringify(a)) as EconomyState).toEqual(a);
  });

  it("rejects negative, fractional and non-finite starting credits", () => {
    expect(() => createInitialEconomyState(-1)).toThrow(RangeError);
    expect(() => createInitialEconomyState(0.5)).toThrow(RangeError);
    expect(() => createInitialEconomyState(Number.NaN)).toThrow(RangeError);
    expect(() => createInitialEconomyState(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});
