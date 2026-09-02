import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CREDITS_CHANGED } from "../model/economy-event";
import type { EconomyApplied } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { TransactionService } from "../model/transaction-service";
import { createInitialEconomyState } from "./economy-state-factory";
import { LedgerTransactionService } from "./transaction-service";

const STARTING = 1000;

/** Fresh service and state per test so id counters never leak. */
function setup(): {
  ids: SequentialIdGenerator;
  service: TransactionService;
  state: EconomyState;
} {
  const ids = new SequentialIdGenerator();
  return {
    ids,
    service: new LedgerTransactionService(ids),
    state: createInitialEconomyState(STARTING),
  };
}

/** Deep snapshot to prove the input state was not mutated. */
function snapshot(state: EconomyState): EconomyState {
  return JSON.parse(JSON.stringify(state)) as EconomyState;
}

describe("LedgerTransactionService.canAfford", () => {
  it("is true at or above the balance and false below", () => {
    const { service, state } = setup();
    expect(service.canAfford(state, 0)).toBe(true);
    expect(service.canAfford(state, STARTING - 1)).toBe(true);
    expect(service.canAfford(state, STARTING)).toBe(true);
    expect(service.canAfford(state, STARTING + 1)).toBe(false);
  });

  it("rejects amounts that are not whole non-negative credits", () => {
    const { service, state } = setup();
    expect(() => service.canAfford(state, -1)).toThrow(RangeError);
    expect(() => service.canAfford(state, 1.5)).toThrow(RangeError);
    expect(() => service.canAfford(state, Number.NaN)).toThrow(RangeError);
  });
});

describe("LedgerTransactionService.spend", () => {
  it("debits credits, appends one negative entry and emits CreditsChanged", () => {
    const { service, state } = setup();
    const before = snapshot(state);

    const result = service.spend(state, 300, "purchase", "squad-1", 4);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { state: next, events } = result.value;
    expect(next.credits).toBe(700);
    expect(next.ledger).toHaveLength(1);
    expect(next.ledger[0]).toEqual({
      id: "txn-1",
      day: 4,
      amount: -300,
      kind: "purchase",
      ref: "squad-1",
    });
    expect(events).toEqual([
      {
        type: CREDITS_CHANGED,
        payload: { before: 1000, after: 700, transaction: next.ledger[0] },
      },
    ]);
    expect(state).toEqual(before);
    expect(next).not.toBe(state);
    expect(next.ledger).not.toBe(state.ledger);
  });

  it("allows spending the exact balance down to zero", () => {
    const { service, state } = setup();
    const result = service.spend(state, STARTING, "purchase", "mech-1", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.state.credits).toBe(0);
  });

  it("refuses insufficient funds without changing state or consuming an id", () => {
    const { service, state, ids } = setup();
    const before = snapshot(state);

    const result = service.spend(state, STARTING + 1, "repair", "mech-2", 2);

    expect(result).toEqual({
      ok: false,
      error: {
        type: "insufficient-credits",
        required: STARTING + 1,
        available: STARTING,
      },
    });
    expect(state).toEqual(before);
    expect(ids.getState()).toEqual({ counters: {} });

    const retry = service.spend(state, 10, "repair", "mech-2", 2);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.value.state.ledger[0]?.id).toBe("txn-1");
  });

  it("records a zero spend as +0, never -0", () => {
    const { service, state } = setup();
    const result = service.spend(state, 0, "event", "event-1", 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const amount = result.value.state.ledger[0]?.amount;
    expect(Object.is(amount, 0)).toBe(true);
    expect(result.value.state.credits).toBe(STARTING);
  });

  it("throws on invalid amount or day before touching anything", () => {
    const { service, state, ids } = setup();
    const before = snapshot(state);
    expect(() => service.spend(state, -5, "purchase", "x", 1)).toThrow(
      RangeError,
    );
    expect(() => service.spend(state, 5, "purchase", "x", -1)).toThrow(
      RangeError,
    );
    expect(() => service.spend(state, 5, "purchase", "x", 1.5)).toThrow(
      RangeError,
    );
    expect(state).toEqual(before);
    expect(ids.getState()).toEqual({ counters: {} });
  });
});

describe("LedgerTransactionService.earn", () => {
  it("credits the balance, appends one positive entry and emits CreditsChanged", () => {
    const { service, state } = setup();
    const before = snapshot(state);

    const { state: next, events } = service.earn(
      state,
      250,
      "reward",
      "mission-7",
      9,
    );

    expect(next.credits).toBe(1250);
    expect(next.ledger).toEqual([
      { id: "txn-1", day: 9, amount: 250, kind: "reward", ref: "mission-7" },
    ]);
    expect(events).toEqual([
      {
        type: CREDITS_CHANGED,
        payload: { before: 1000, after: 1250, transaction: next.ledger[0] },
      },
    ]);
    expect(state).toEqual(before);
  });

  it("throws on invalid amount or day", () => {
    const { service, state } = setup();
    expect(() => service.earn(state, 0.25, "stipend", "earth", 1)).toThrow(
      RangeError,
    );
    expect(() =>
      service.earn(state, 10, "stipend", "earth", Number.NaN),
    ).toThrow(RangeError);
  });
});

describe("LedgerTransactionService ledger growth", () => {
  it("appends exactly one entry per call, in order, with sequential ids", () => {
    const { service } = setup();
    let state = createInitialEconomyState(STARTING);

    state = service.earn(state, 500, "stipend", "earth", 1).state;
    const buy = service.spend(state, 800, "purchase", "squad-1", 1);
    if (!buy.ok) throw new Error("expected spend to succeed");
    state = buy.value.state;
    state = service.earn(state, 120, "sale", "part-3", 2).state;
    const fix = service.spend(state, 60, "repair", "mech-1", 2);
    if (!fix.ok) throw new Error("expected spend to succeed");
    state = fix.value.state;
    state = service.earn(state, 500, "stipend", "earth", 3).state;

    expect(state.ledger.map((t) => t.id)).toEqual([
      "txn-1",
      "txn-2",
      "txn-3",
      "txn-4",
      "txn-5",
    ]);
    expect(state.ledger.map((t) => t.amount)).toEqual([
      500, -800, 120, -60, 500,
    ]);
    const movement = state.ledger.reduce((sum, t) => sum + t.amount, 0);
    expect(STARTING + movement).toBe(state.credits);
    expect(state.credits).toBe(1260);
  });

  it("continues ids from a restored generator and stays JSON-serializable", () => {
    const first = setup();
    const applied = first.service.earn(first.state, 1, "event", "e-1", 1);
    const restoredIds = new SequentialIdGenerator(
      JSON.parse(JSON.stringify(first.ids.getState())) as ReturnType<
        SequentialIdGenerator["getState"]
      >,
    );
    const second = new LedgerTransactionService(restoredIds);
    const next = second.earn(applied.state, 1, "event", "e-2", 1);

    expect(next.state.ledger.map((t) => t.id)).toEqual(["txn-1", "txn-2"]);
    const roundTripped = JSON.parse(JSON.stringify(next)) as EconomyApplied;
    expect(roundTripped).toEqual(next);
  });
});
