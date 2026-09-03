import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import type { Mech } from "../model/mech";
import { describeRosterError } from "../model/roster-error";
import { MECH_REPAIRED } from "../model/roster-event";
import type { RosterTuning } from "../model/roster-tuning";
import type { RepairServiceDeps } from "./repair-service";
import { repairCost, repairMech } from "./repair-service";
import type { RosterSlices } from "./roster-service";

// ===========================================
// Fixtures
// ===========================================

const DAY = 9;
const TUNING: RosterTuning = {
  repairCostPerPoint: 10,
  xpPerMissionSurvived: 0,
};

/** A mech with the given damage. */
function mech(id: string, damage: number): Mech {
  return {
    id,
    name: id,
    loadout: {
      name: "L",
      chassisId: "c",
      legsId: "l",
      armsId: "a",
      armWeaponId: "aw",
      backWeaponId: "bw",
      utilityIds: [],
    },
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

/** Fresh deps and slices per test. */
function setup(credits = 1000): {
  deps: RepairServiceDeps;
  slices: RosterSlices;
  snapshot: RosterSlices;
} {
  const deps: RepairServiceDeps = {
    tuning: TUNING,
    transactions: new LedgerTransactionService(new SequentialIdGenerator()),
  };
  const slices: RosterSlices = {
    roster: {
      squads: [],
      mechs: [mech("mech-1", 35), mech("mech-2", 0)],
      savedLoadouts: [],
      graveyard: [],
    },
    economy: { credits, ledger: [] },
  };
  return {
    deps,
    slices,
    snapshot: JSON.parse(JSON.stringify(slices)) as RosterSlices,
  };
}

// ===========================================
// Tests
// ===========================================

describe("repairCost", () => {
  it("is repairCostPerPoint × damage", () => {
    expect(repairCost(mech("m", 35), TUNING)).toBe(350);
    expect(repairCost(mech("m", 0), TUNING)).toBe(0);
    expect(
      repairCost(mech("m", 100), { ...TUNING, repairCostPerPoint: 7 }),
    ).toBe(700);
  });
});

describe("repairMech", () => {
  it("zeroes the damage, charges the cost as a repair and emits CreditsChanged then MechRepaired", () => {
    const { deps, slices, snapshot } = setup();
    const result = repairMech(slices, "mech-1", DAY, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.roster.mechs[0]).toEqual(mech("mech-1", 0));
    expect(result.value.roster.mechs[1]).toBe(slices.roster.mechs[1]);
    expect(result.value.economy.credits).toBe(650);
    expect(result.value.economy.ledger).toEqual([
      { id: "txn-1", day: DAY, amount: -350, kind: "repair", ref: "mech-1" },
    ]);
    expect(result.value.events).toEqual([
      expect.objectContaining({ type: CREDITS_CHANGED }),
      {
        type: MECH_REPAIRED,
        payload: { mechId: "mech-1", from: 35, to: 0, cost: 350 },
      },
    ]);
    expect(slices).toEqual(snapshot);
  });

  it("can spend the exact balance", () => {
    const { deps, slices } = setup(350);
    const result = repairMech(slices, "mech-1", DAY, deps);
    expect(result.ok && result.value.economy.credits).toBe(0);
  });

  it("rejects an unknown mech", () => {
    const { deps, slices } = setup();
    const result = repairMech(slices, "mech-9", DAY, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "unknown-mech", mechId: "mech-9" });
    expect(describeRosterError(result.error)).toContain("mech-9");
  });

  it("rejects an undamaged mech", () => {
    const { deps, slices } = setup();
    const result = repairMech(slices, "mech-2", DAY, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "mech-undamaged", mechId: "mech-2" });
    expect(describeRosterError(result.error)).toContain("mech-2");
  });

  it("rejects an unaffordable repair with nothing changed", () => {
    const { deps, slices, snapshot } = setup(349);
    const result = repairMech(slices, "mech-1", DAY, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: 350,
      available: 349,
    });
    expect(slices).toEqual(snapshot);
  });
});
