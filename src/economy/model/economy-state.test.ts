import { describe, expect, it } from "vitest";

import type { EconomyState } from "./economy-state";

describe("EconomyState", () => {
  it("round-trips through JSON with a populated ledger", () => {
    const state: EconomyState = {
      credits: 4700,
      ledger: [
        { id: "txn-1", day: 1, amount: 500, kind: "stipend", ref: "earth" },
        { id: "txn-2", day: 1, amount: -800, kind: "purchase", ref: "squad-3" },
      ],
    };
    const restored = JSON.parse(JSON.stringify(state)) as EconomyState;
    expect(restored).toEqual(state);
    expect(restored.ledger).toHaveLength(2);
    expect(restored.ledger[1]?.kind).toBe("purchase");
  });

  it("keeps credits reconcilable against the ledger", () => {
    const startingCredits = 5000;
    const state: EconomyState = {
      credits: 4700,
      ledger: [
        { id: "txn-1", day: 1, amount: 500, kind: "stipend", ref: "earth" },
        { id: "txn-2", day: 1, amount: -800, kind: "purchase", ref: "squad-3" },
      ],
    };
    const movement = state.ledger.reduce((sum, t) => sum + t.amount, 0);
    expect(startingCredits + movement).toBe(state.credits);
  });
});
