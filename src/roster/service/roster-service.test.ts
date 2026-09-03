import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { EconomyState } from "../../economy/model/economy-state";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { MECH_RATING_TUNING } from "../data/mech-rating-tuning";
import { STARTER_PARTS } from "../data/parts";
import { SQUAD_TYPES } from "../data/squad-types";
import { STARTER_LOADOUT } from "../data/starter-roster";
import type { MechLoadout } from "../model/mech-loadout";
import type { RosterError } from "../model/roster-error";
import { describeRosterError } from "../model/roster-error";
import type { RosterApplied } from "../model/roster-event";
import {
  LOADOUT_DELETED,
  LOADOUT_SAVED,
  MECH_BUILT,
  SQUAD_HIRED,
  SQUAD_REINFORCED,
} from "../model/roster-event";
import type { RosterState } from "../model/roster-state";
import type { Squad } from "../model/squad";
import { DataSquadTypeCatalogue } from "../repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import type { RosterServiceDeps, RosterSlices } from "./roster-service";
import {
  buildMech,
  deleteLoadout,
  hireSquad,
  reinforceSquad,
  saveLoadout,
} from "./roster-service";

// ===========================================
// Fixtures
// ===========================================

const RIFLE = SQUAD_TYPES.find((t) => t.id === "rifle")!;
const DAY = 4;
/** Starter loadout cost with the shipped parts (validated in #49's tests). */
const STARTER_COST = 3250;

const DEPLETED: Squad = {
  id: "squad-1",
  name: "Alpha",
  typeId: "rifle",
  strength: 3,
  maxStrength: 5,
  kills: 2,
  missionsSurvived: 1,
  xp: 10,
};

const FULL: Squad = { ...DEPLETED, id: "squad-2", name: "Bravo", strength: 5 };

const ROSTER: RosterState = {
  squads: [DEPLETED, FULL],
  mechs: [],
  savedLoadouts: [STARTER_LOADOUT],
};

/** Fresh deps and slices per test so ids and ledgers never leak. */
function setup(credits = 10_000): {
  deps: RosterServiceDeps;
  slices: RosterSlices;
  snapshot: RosterSlices;
} {
  const ids = new SequentialIdGenerator();
  const deps: RosterServiceDeps = {
    squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
    parts: new StaticPartCatalogue(STARTER_PARTS),
    rating: MECH_RATING_TUNING,
    transactions: new LedgerTransactionService(ids),
    ids,
  };
  const economy: EconomyState = { credits, ledger: [] };
  const slices = { roster: ROSTER, economy };
  return {
    deps,
    slices,
    snapshot: JSON.parse(JSON.stringify(slices)) as RosterSlices,
  };
}

/** Unwraps a success, failing the test otherwise. */
function expectOk(result: ReturnType<typeof hireSquad>): RosterApplied {
  if (!result.ok) {
    throw new Error(`expected ok, got ${describeRosterError(result.error)}`);
  }
  return result.value;
}

/** Unwraps a failure, failing the test otherwise. */
function expectErr(result: ReturnType<typeof hireSquad>): RosterError {
  if (result.ok) {
    throw new Error("expected err");
  }
  return result.error;
}

// ===========================================
// hireSquad
// ===========================================

describe("hireSquad", () => {
  it("adds a full-strength squad, charges hireCost and emits CreditsChanged then SquadHired", () => {
    const { deps, slices, snapshot } = setup();
    const applied = expectOk(hireSquad(slices, "rifle", "Charlie", DAY, deps));

    const squad = applied.roster.squads[2]!;
    expect(squad).toEqual({
      id: "squad-1",
      name: "Charlie",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    });
    expect(applied.roster.squads.slice(0, 2)).toEqual([DEPLETED, FULL]);
    expect(applied.economy.credits).toBe(10_000 - RIFLE.hireCost);
    expect(applied.economy.ledger).toEqual([
      {
        id: "txn-1",
        day: DAY,
        amount: -RIFLE.hireCost,
        kind: "purchase",
        ref: "squad-1",
      },
    ]);
    expect(applied.events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      SQUAD_HIRED,
    ]);
    expect(applied.events[1]).toEqual({
      type: SQUAD_HIRED,
      payload: { squad, cost: RIFLE.hireCost },
    });
    expect(slices).toEqual(snapshot);
  });

  it("rejects an unknown squad type", () => {
    const { deps, slices } = setup();
    expect(expectErr(hireSquad(slices, "cavalry", "X", DAY, deps))).toEqual({
      code: "unknown-squad-type",
      typeId: "cavalry",
    });
  });

  it("rejects an empty name", () => {
    const { deps, slices } = setup();
    expect(expectErr(hireSquad(slices, "rifle", "  ", DAY, deps))).toEqual({
      code: "invalid-name",
      name: "  ",
    });
  });

  it("rejects an unaffordable hire without drawing an id", () => {
    const { deps, slices, snapshot } = setup(RIFLE.hireCost - 1);
    expect(expectErr(hireSquad(slices, "rifle", "X", DAY, deps))).toEqual({
      code: "insufficient-credits",
      required: RIFLE.hireCost,
      available: RIFLE.hireCost - 1,
    });
    expect(deps.ids.getState().counters).toEqual({});
    expect(slices).toEqual(snapshot);
  });

  it("can spend the exact balance", () => {
    const { deps, slices } = setup(RIFLE.hireCost);
    expect(
      expectOk(hireSquad(slices, "rifle", "X", DAY, deps)).economy.credits,
    ).toBe(0);
  });
});

// ===========================================
// reinforceSquad
// ===========================================

describe("reinforceSquad", () => {
  it("adds soldiers at the per-soldier rate and emits SquadReinforced", () => {
    const { deps, slices, snapshot } = setup();
    const applied = expectOk(reinforceSquad(slices, "squad-1", 2, DAY, deps));
    const cost = RIFLE.reinforceCostPerSoldier * 2;

    expect(applied.roster.squads[0]).toEqual({ ...DEPLETED, strength: 5 });
    expect(applied.roster.squads[1]).toBe(FULL);
    expect(applied.economy.credits).toBe(10_000 - cost);
    expect(applied.economy.ledger[0]).toMatchObject({
      amount: -cost,
      kind: "reinforcement",
      ref: "squad-1",
      day: DAY,
    });
    expect(applied.events).toEqual([
      expect.objectContaining({ type: CREDITS_CHANGED }),
      {
        type: SQUAD_REINFORCED,
        payload: { squadId: "squad-1", from: 3, to: 5, cost },
      },
    ]);
    expect(slices).toEqual(snapshot);
  });

  it("rejects an unknown squad", () => {
    const { deps, slices } = setup();
    expect(expectErr(reinforceSquad(slices, "squad-9", 1, DAY, deps))).toEqual({
      code: "unknown-squad",
      squadId: "squad-9",
    });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["more than missing", 3],
  ])("rejects a %s soldier count", (_label, soldiers) => {
    const { deps, slices } = setup();
    expect(
      expectErr(reinforceSquad(slices, "squad-1", soldiers, DAY, deps)),
    ).toEqual({
      code: "invalid-reinforcement",
      squadId: "squad-1",
      requested: soldiers,
      missing: 2,
    });
  });

  it("rejects any reinforcement of a full squad", () => {
    const { deps, slices } = setup();
    expect(
      expectErr(reinforceSquad(slices, "squad-2", 1, DAY, deps)),
    ).toMatchObject({ code: "invalid-reinforcement", missing: 0 });
  });

  it("rejects an unaffordable reinforcement with nothing changed", () => {
    const { deps, slices, snapshot } = setup(RIFLE.reinforceCostPerSoldier);
    expect(expectErr(reinforceSquad(slices, "squad-1", 2, DAY, deps))).toEqual({
      code: "insufficient-credits",
      required: RIFLE.reinforceCostPerSoldier * 2,
      available: RIFLE.reinforceCostPerSoldier,
    });
    expect(slices).toEqual(snapshot);
  });
});

// ===========================================
// saveLoadout / deleteLoadout
// ===========================================

describe("saveLoadout", () => {
  const brawler: MechLoadout = { ...STARTER_LOADOUT, name: "Brawler" };

  it("appends a new validated template without charging", () => {
    const { deps, slices, snapshot } = setup();
    const applied = expectOk(saveLoadout(slices, brawler, deps));
    expect(applied.roster.savedLoadouts).toEqual([STARTER_LOADOUT, brawler]);
    expect(applied.economy).toBe(slices.economy);
    expect(applied.events).toEqual([
      {
        type: LOADOUT_SAVED,
        payload: { loadout: brawler, replaced: false },
      },
    ]);
    expect(slices).toEqual(snapshot);
  });

  it("replaces a same-named template in place", () => {
    const { deps, slices } = setup();
    const revised: MechLoadout = { ...STARTER_LOADOUT, utilityIds: [] };
    const applied = expectOk(saveLoadout(slices, revised, deps));
    expect(applied.roster.savedLoadouts).toEqual([revised]);
    expect(applied.events[0]).toEqual({
      type: LOADOUT_SAVED,
      payload: { loadout: revised, replaced: true },
    });
  });

  it("rejects an unbuildable loadout with every validation error", () => {
    const { deps, slices } = setup();
    const broken: MechLoadout = { ...brawler, legsId: "nope", armsId: "" };
    const error = expectErr(saveLoadout(slices, broken, deps));
    expect(error).toMatchObject({
      code: "invalid-loadout",
      name: "Brawler",
    });
    if (error.code !== "invalid-loadout") return;
    expect(error.errors.map((e) => e.code)).toEqual([
      "unknown-part",
      "missing-part",
    ]);
  });

  it("rejects an empty name", () => {
    const { deps, slices } = setup();
    expect(
      expectErr(saveLoadout(slices, { ...brawler, name: "" }, deps)),
    ).toEqual({ code: "invalid-name", name: "" });
  });
});

describe("deleteLoadout", () => {
  it("removes the named template and emits LoadoutDeleted", () => {
    const { slices, snapshot } = setup();
    const applied = expectOk(deleteLoadout(slices, STARTER_LOADOUT.name));
    expect(applied.roster.savedLoadouts).toEqual([]);
    expect(applied.economy).toBe(slices.economy);
    expect(applied.events).toEqual([
      { type: LOADOUT_DELETED, payload: { name: STARTER_LOADOUT.name } },
    ]);
    expect(slices).toEqual(snapshot);
  });

  it("rejects a name that is not saved", () => {
    const { slices } = setup();
    expect(expectErr(deleteLoadout(slices, "Ghost"))).toEqual({
      code: "unknown-loadout",
      name: "Ghost",
    });
  });
});

// ===========================================
// buildMech
// ===========================================

describe("buildMech", () => {
  it("builds from a saved template, charges totalCost and emits MechBuilt", () => {
    const { deps, slices, snapshot } = setup();
    const applied = expectOk(
      buildMech(slices, STARTER_LOADOUT.name, "Anvil", DAY, deps),
    );
    const mech = applied.roster.mechs[0]!;
    expect(mech).toEqual({
      id: "mech-1",
      name: "Anvil",
      loadout: STARTER_LOADOUT,
      damage: 0,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    });
    expect(mech.loadout).not.toBe(STARTER_LOADOUT);
    expect(applied.economy.credits).toBe(10_000 - STARTER_COST);
    expect(applied.economy.ledger[0]).toMatchObject({
      amount: -STARTER_COST,
      kind: "purchase",
      ref: "mech-1",
      day: DAY,
    });
    expect(applied.events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      MECH_BUILT,
    ]);
    expect(applied.events[1]).toMatchObject({
      type: MECH_BUILT,
      payload: {
        mech,
        cost: STARTER_COST,
        statSheet: { totalCost: STARTER_COST, combatRating: 129 },
      },
    });
    expect(slices).toEqual(snapshot);
  });

  it("rejects an unknown loadout name", () => {
    const { deps, slices } = setup();
    expect(expectErr(buildMech(slices, "Ghost", "X", DAY, deps))).toEqual({
      code: "unknown-loadout",
      name: "Ghost",
    });
  });

  it("rejects an empty mech name", () => {
    const { deps, slices } = setup();
    expect(
      expectErr(buildMech(slices, STARTER_LOADOUT.name, "", DAY, deps)),
    ).toEqual({ code: "invalid-name", name: "" });
  });

  it("re-validates the template against the current catalogue", () => {
    const { deps, slices } = setup();
    const narrowed: RosterServiceDeps = {
      ...deps,
      parts: new StaticPartCatalogue(
        STARTER_PARTS.filter((p) => p.id !== STARTER_LOADOUT.armWeaponId),
      ),
    };
    const error = expectErr(
      buildMech(slices, STARTER_LOADOUT.name, "X", DAY, narrowed),
    );
    expect(error).toMatchObject({
      code: "invalid-loadout",
      name: STARTER_LOADOUT.name,
    });
    if (error.code !== "invalid-loadout") return;
    expect(error.errors).toEqual([
      expect.objectContaining({ code: "unknown-part", slot: "arm-weapon" }),
    ]);
  });

  it("rejects an unaffordable build without drawing an id", () => {
    const { deps, slices, snapshot } = setup(STARTER_COST - 1);
    expect(
      expectErr(buildMech(slices, STARTER_LOADOUT.name, "X", DAY, deps)),
    ).toEqual({
      code: "insufficient-credits",
      required: STARTER_COST,
      available: STARTER_COST - 1,
    });
    expect(deps.ids.getState().counters).toEqual({});
    expect(slices).toEqual(snapshot);
  });
});

// ===========================================
// describeRosterError
// ===========================================

describe("describeRosterError", () => {
  it("names the offending value for every code", () => {
    const cases: [RosterError, string][] = [
      [{ code: "unknown-squad-type", typeId: "cav" }, "cav"],
      [{ code: "unknown-squad", squadId: "squad-7" }, "squad-7"],
      [
        {
          code: "invalid-reinforcement",
          squadId: "s",
          requested: 9,
          missing: 2,
        },
        "9",
      ],
      [{ code: "unknown-loadout", name: "Ghost" }, "Ghost"],
      [
        {
          code: "invalid-loadout",
          name: "L",
          errors: [{ code: "overweight", detail: "Too heavy." }],
        },
        "Too heavy.",
      ],
      [{ code: "invalid-name", name: "" }, "not a valid name"],
      [{ code: "insufficient-credits", required: 5, available: 1 }, "5"],
    ];
    for (const [error, fragment] of cases) {
      expect(describeRosterError(error)).toContain(fragment);
    }
  });
});
