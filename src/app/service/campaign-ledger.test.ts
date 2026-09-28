import { describe, expect, it } from "vitest";

import type { Transaction } from "../../economy/model/transaction";
import type { LedgerContext } from "./campaign-ledger.test-helper";
import {
  accountLedger,
  bandOfDay,
  INCOME_LINES,
  moneyLineOf,
  SPENDING_LINES,
  totalOf,
} from "./campaign-ledger.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** A ledger entry of `kind` for `amount` against `ref` on `day`. */
function entry(
  kind: Transaction["kind"],
  amount: number,
  ref: string,
  day = 1,
): Transaction {
  return { id: `txn-${ref}-${String(day)}`, day, amount, kind, ref };
}

/** A context with every day in Act I, `mission-9` a story mission and `mech-1` the starting mech. */
function context(overrides: Partial<LedgerContext> = {}): LedgerContext {
  return {
    bandOf: () => "act-1",
    storyMissions: new Set(["mission-9"]),
    startingMechs: new Set(["mech-1"]),
    ...overrides,
  };
}

// ===========================================
// Lines
// ===========================================

describe("moneyLineOf", () => {
  it("puts every kind of entry on its line", () => {
    const none = new Set<string>();
    const story = new Set(["mission-9"]);
    const cases: [Transaction, string][] = [
      [entry("reward", 900, "mission-3"), "reward"],
      [entry("reward", 2400, "mission-9"), "story-reward"],
      [entry("stipend", 480, "earth"), "stipend"],
      [entry("event", 1200, "event-2"), "event-income"],
      [entry("event", -300, "event-3"), "event-cost"],
      [entry("sale", 100, "part-x"), "sale"],
      [entry("purchase", -600, "squad-6"), "squad-hire"],
      [entry("purchase", -2850, "mech-2"), "mech-build"],
      [entry("purchase", -1500, "deployable-1"), "deployable-build"],
      [entry("purchase", -99, "something"), "other"],
      [entry("reinforcement", -160, "squad-1"), "reinforcement"],
      [entry("repair", -200, "mech-1"), "repair"],
      [entry("upkeep", -50, "deployable-1"), "upkeep"],
    ];
    for (const [each, line] of cases) {
      expect(moneyLineOf(each, none, story), `${each.kind} ${each.ref}`).toBe(
        line,
      );
    }
  });

  it("reads a purchase against something already bought as its upgrade", () => {
    const bought = new Set(["mech-2", "deployable-1"]);
    const story = new Set<string>();
    expect(moneyLineOf(entry("purchase", -300, "mech-2"), bought, story)).toBe(
      "mech-upgrade",
    );
    expect(
      moneyLineOf(entry("purchase", -1300, "deployable-1"), bought, story),
    ).toBe("deployable-upgrade");
  });
});

// ===========================================
// Accounts
// ===========================================

describe("accountLedger", () => {
  it("sums each line per band, income and spending both positive", () => {
    const ledger = [
      entry("stipend", 500, "earth", 1),
      entry("reward", 900, "mission-3", 2),
      entry("upkeep", -50, "deployable-1", 2),
      entry("stipend", 400, "earth", 5),
      entry("reward", 2400, "mission-9", 6),
    ];
    const accounts = accountLedger(
      ledger,
      context({ bandOf: (day) => (day < 5 ? "act-1" : "act-2") }),
    );
    expect(accounts["act-1"]).toMatchObject({
      stipend: 500,
      reward: 900,
      upkeep: 50,
      "story-reward": 0,
    });
    expect(accounts["act-2"]).toMatchObject({
      stipend: 400,
      "story-reward": 2400,
      reward: 0,
    });
    expect(accounts["act-3"].stipend).toBe(0);
    expect(totalOf(accounts["act-1"], INCOME_LINES)).toBe(1400);
    expect(totalOf(accounts["act-1"], SPENDING_LINES)).toBe(50);
  });

  it("counts an installation's or a mech's first purchase as its build and later ones as upgrades; the starting mech was never bought", () => {
    const ledger = [
      entry("purchase", -1500, "deployable-1", 1),
      entry("purchase", -1500, "deployable-1", 3),
      entry("purchase", -2850, "mech-2", 3),
      entry("purchase", -250, "mech-2", 4),
      entry("purchase", -250, "mech-1", 4),
    ];
    const account = accountLedger(ledger, context())["act-1"];
    expect(account["deployable-build"]).toBe(1500);
    expect(account["deployable-upgrade"]).toBe(1500);
    expect(account["mech-build"]).toBe(2850);
    expect(account["mech-upgrade"]).toBe(500);
  });

  it("drops an entry whose day has no band", () => {
    const account = accountLedger([entry("stipend", 500, "earth", 0)], {
      ...context(),
      bandOf: () => undefined,
    });
    expect(totalOf(account["act-1"], INCOME_LINES)).toBe(0);
  });
});

describe("bandOfDay", () => {
  it("puts a day in the last act that had begun by then, counting from the campaign's first day", () => {
    const bandOf = bandOfDay(
      {
        "act-1": { missions: 0, days: 0, threat: 0 },
        "act-2": { missions: 13, days: 18, threat: 9 },
      },
      100,
    );
    expect(bandOf(99)).toBeUndefined();
    expect(bandOf(100)).toBe("act-1");
    expect(bandOf(117)).toBe("act-1");
    expect(bandOf(118)).toBe("act-2");
    expect(bandOf(400)).toBe("act-2");
  });
});
