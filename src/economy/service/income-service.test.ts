import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import type { EarthMap } from "../../overworld/model/earth-map";
import { buildEarthMap } from "../../overworld/service/earth-map-builder";
import { unfestedFraction } from "../../overworld/service/threat-service";
import { ECONOMY_TUNING } from "../data/economy-tuning";
import { CREDITS_CHANGED } from "../model/economy-event";
import type { EconomyState } from "../model/economy-state";
import type { EconomyTuning } from "../model/economy-tuning";
import { createInitialEconomyState } from "./economy-state-factory";
import { applyStipend, computeStipend, STIPEND_REF } from "./income-service";
import { LedgerTransactionService } from "./transaction-service";

/** A one-region Earth whose cities have the given infestation levels. */
function earthWith(...levels: number[]): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "r",
        name: "R",
        biome: "temperate",
        cities: levels.map((infestation, i) => ({
          id: `c${i}`,
          name: `C${i}`,
          layout: { x: 0.5, y: 0.5 },
          infestation,
        })),
      },
    ],
    links: levels.slice(1).map((_, i) => [`c${i}`, `c${i + 1}`] as const),
  });
}

const TUNING: EconomyTuning = {
  startingCredits: 1000,
  baseStipend: 500,
  stipendFloor: 50,
};

describe("computeStipend", () => {
  it("pays the full base stipend for a clean Earth", () => {
    expect(computeStipend(earthWith(0, 0, 0), TUNING)).toBe(500);
    expect(computeStipend(EARTH_MAP, ECONOMY_TUNING)).toBe(
      ECONOMY_TUNING.baseStipend,
    );
  });

  it("pays the floor for an overrun Earth", () => {
    expect(computeStipend(earthWith(100, 100, 100), TUNING)).toBe(50);
  });

  it("scales linearly with the unfested fraction", () => {
    expect(computeStipend(earthWith(0, 50, 100), TUNING)).toBe(250);
    expect(computeStipend(earthWith(20, 20, 20, 20), TUNING)).toBe(400);
  });

  it("rounds to whole credits", () => {
    // mean 10/3 → unfested 0.9666… → 483.33… → 483
    expect(computeStipend(earthWith(0, 0, 10), TUNING)).toBe(483);
    expect(Number.isInteger(computeStipend(earthWith(7, 13, 29), TUNING))).toBe(
      true,
    );
  });

  it("applies the floor once the scaled stipend falls below it", () => {
    // unfested 0.05 → 25, below the floor of 50
    expect(computeStipend(earthWith(95, 95), TUNING)).toBe(50);
    // unfested 0.11 → 55, just above the floor
    expect(computeStipend(earthWith(89, 89), TUNING)).toBe(55);
  });

  it("honours substitute tuning", () => {
    const generous: EconomyTuning = { ...TUNING, baseStipend: 2000 };
    expect(computeStipend(earthWith(0, 50, 100), generous)).toBe(1000);
    const highFloor: EconomyTuning = { ...TUNING, stipendFloor: 400 };
    expect(computeStipend(earthWith(0, 50, 100), highFloor)).toBe(400);
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
    const map = earthWith(0, 0);

    const { state, events } = applyStipend(
      economy,
      map,
      3,
      TUNING,
      transactions,
    );

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
    const { state } = applyStipend(
      economy,
      earthWith(100, 100),
      1,
      TUNING,
      transactions,
    );
    expect(state.credits).toBe(1050);
    expect(state.ledger[0]?.amount).toBe(TUNING.stipendFloor);
    expect(state.ledger[0]?.kind).toBe("stipend");
  });

  it("accumulates one entry per day across consecutive days", () => {
    const { transactions } = setup();
    let economy = createInitialEconomyState(0);
    const map = earthWith(0, 50, 100);
    for (let day = 1; day <= 3; day++) {
      economy = applyStipend(economy, map, day, TUNING, transactions).state;
    }
    expect(economy.credits).toBe(750);
    expect(economy.ledger.map((t) => [t.id, t.day])).toEqual([
      ["txn-1", 1],
      ["txn-2", 2],
      ["txn-3", 3],
    ]);
  });

  it("matches the threat service's unfested fraction on real data", () => {
    const { transactions, economy } = setup();
    const map = earthWith(30, 0, 0, 0);
    const expected = Math.max(
      TUNING.stipendFloor,
      Math.round(TUNING.baseStipend * unfestedFraction(map)),
    );
    const { state } = applyStipend(economy, map, 1, TUNING, transactions);
    expect(state.credits - economy.credits).toBe(expected);
  });
});
