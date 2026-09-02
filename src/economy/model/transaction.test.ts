import { describe, expect, it } from "vitest";

import {
  TRANSACTION_KINDS,
  isTransactionKind,
  type Transaction,
  type TransactionKind,
} from "./transaction";

describe("TransactionKind", () => {
  it("covers exactly the kinds the GDD economy needs", () => {
    const expected: readonly TransactionKind[] = [
      "purchase",
      "sale",
      "reward",
      "stipend",
      "upkeep",
      "repair",
      "reinforcement",
      "event",
    ];
    expect([...TRANSACTION_KINDS].sort()).toEqual([...expected].sort());
    expect(new Set(TRANSACTION_KINDS).size).toBe(TRANSACTION_KINDS.length);
  });

  it("narrows strings with isTransactionKind", () => {
    for (const kind of TRANSACTION_KINDS) {
      expect(isTransactionKind(kind)).toBe(true);
    }
    expect(isTransactionKind("")).toBe(false);
    expect(isTransactionKind("Purchase")).toBe(false);
    expect(isTransactionKind("bribe")).toBe(false);
  });
});

describe("Transaction", () => {
  it("round-trips through JSON for every kind and both signs", () => {
    const ledger: Transaction[] = TRANSACTION_KINDS.map((kind, i) => ({
      id: `txn-${i + 1}`,
      day: i + 1,
      amount: i % 2 === 0 ? -(i + 1) * 100 : (i + 1) * 100,
      kind,
      ref: `ref-${i}`,
    }));
    const restored = JSON.parse(JSON.stringify(ledger)) as Transaction[];
    expect(restored).toEqual(ledger);
    expect(restored).not.toBe(ledger);
  });
});
