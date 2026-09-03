import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../data/economy-tuning";
import { CREDITS_CHANGED } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { EconomyTuning } from "../model/economy-tuning";
import { createInitialEconomyState } from "./economy-state-factory";
import { applyStipend, computeStipend, STIPEND_REF } from "./income-service";
import { LedgerTransactionService } from "./transaction-service";

const TUNING: EconomyTuning = {
  startingCredits: 1000,
  baseStipend: 500,
  stipendFloor: 50,
};

describe("computeStipend", () => {
  it("pays the full base stipend for a clean Earth", () => {
    expect(computeStipend(1, TUNING)).toBe(500);
    expect(computeStipend(1, ECONOMY_TUNING)).toBe(ECONOMY_TUNING.baseStipend);
  });

  it("pays the floor for an overrun Earth", () => {
    expect(computeStipend(0, TUNING)).toBe(50);
  });

  it("scales linearly with the unfested fraction", () => {
    expect(computeStipend(0.5, TUNING)).toBe(250);
    expect(computeStipend(0.8, TUNING)).toBe(400);
  });

  it("rounds to whole credits", () => {
    // mean infestation 10/3 → unfested 0.9666… → 483.33… → 483
    expect(computeStipend(1 - 10 / 300, TUNING)).toBe(483);
    expect(Number.isInteger(computeStipend(1 - 49 / 300, TUNING))).toBe(true);
  });

  it("applies the floor once the scaled stipend falls below it", () => {
    // 0.05 → 25, below the floor of 50
    expect(computeStipend(0.05, TUNING)).toBe(50);
    // 0.11 → 55, just above the floor
    expect(computeStipend(0.11, TUNING)).toBe(55);
  });

  it("honours substitute tuning", () => {
    const generous: EconomyTuning = { ...TUNING, baseStipend: 2000 };
    expect(computeStipend(0.5, generous)).toBe(1000);
    const highFloor: EconomyTuning = { ...TUNING, stipendFloor: 400 };
    expect(computeStipend(0.5, highFloor)).toBe(400);
  });
});

describe("applyStipend", () => {
  /** Fresh service and treasury per test so ids never leak. */
  function setup(): {
    transactions: LedgerTransactionService;
    economy: EconomyState;
  } {
    return {
      transactions: new LedgerTransactionService(new SequentialIdGenerator()),
      economy: createInitialEconomyState(TUNING.startingCredits),
    };
  }

  it("pays a clean Earth the full stipend as one ledger entry with an event", () => {
    const { transactions, economy } = setup();
    const before = JSON.parse(JSON.stringify(economy)) as EconomyState;

    const { state, events } = applyStipend(economy, 1, 3, TUNING, transactions);

    expect(state.credits).toBe(1500);
    expect(state.ledger).toEqual([
      { id: "txn-1", day: 3, amount: 500, kind: "stipend", ref: STIPEND_REF },
    ]);
    expect(events).toEqual([
      {
        type: CREDITS_CHANGED,
        payload: { before: 1000, after: 1500, transaction: state.ledger[0] },
      },
    ]);
    expect(economy).toEqual(before);
  });

  it("pays an overrun Earth the floor", () => {
    const { transactions, economy } = setup();
    const { state } = applyStipend(economy, 0, 1, TUNING, transactions);
    expect(state.credits).toBe(1050);
    expect(state.ledger[0]?.amount).toBe(TUNING.stipendFloor);
    expect(state.ledger[0]?.kind).toBe("stipend");
  });

  it("accumulates one entry per day across consecutive days", () => {
    const { transactions } = setup();
    let economy = createInitialEconomyState(0);
    for (let day = 1; day <= 3; day++) {
      economy = applyStipend(economy, 0.5, day, TUNING, transactions).state;
    }
    expect(economy.credits).toBe(750);
    expect(economy.ledger.map((t) => [t.id, t.day])).toEqual([
      ["txn-1", 1],
      ["txn-2", 2],
      ["txn-3", 3],
    ]);
  });

  it("pays computeStipend's amount for a fractional unfested share", () => {
    const { transactions, economy } = setup();
    const fraction = 1 - 30 / 400;
    const { state } = applyStipend(economy, fraction, 1, TUNING, transactions);
    expect(state.credits - economy.credits).toBe(
      computeStipend(fraction, TUNING),
    );
    expect(state.credits - economy.credits).toBe(463);
  });
});
