import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { STARTER_PARTS } from "../data/parts";
import { STARTER_LOADOUT } from "../data/starter-roster";
import { UPGRADE_TUNING } from "../data/upgrade-tuning";
import type { Mech } from "../model/mech";
import { describeRosterError } from "../model/roster-error";
import { PART_UPGRADED } from "../model/roster-event";
import { StaticPartCatalogue } from "../repository/static-part-catalogue";
import type { RosterSlices } from "./roster-service";
import type { UpgradeServiceDeps } from "./upgrade-service";
import { upgradePart } from "./upgrade-service";

// ===========================================
// Fixtures
// ===========================================

const DAY = 6;
const GUN = STARTER_LOADOUT.armWeaponId;
const GUN_COST = STARTER_PARTS.find((p) => p.id === GUN)!.cost;

/** A mech built from the starter loadout with the given upgrade levels. */
function mech(upgrades?: Record<string, number>): Mech {
  return {
    id: "mech-1",
    name: "Anvil",
    loadout: upgrades ? { ...STARTER_LOADOUT, upgrades } : STARTER_LOADOUT,
    damage: 0,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

/** Fresh deps and slices per test. */
function setup(
  credits = 10_000,
  upgrades?: Record<string, number>,
): { deps: UpgradeServiceDeps; slices: RosterSlices; snapshot: RosterSlices } {
  const deps: UpgradeServiceDeps = {
    parts: new StaticPartCatalogue(STARTER_PARTS),
    upgrades: UPGRADE_TUNING,
    transactions: new LedgerTransactionService(new SequentialIdGenerator()),
  };
  const slices: RosterSlices = {
    roster: {
      squads: [],
      mechs: [mech(upgrades)],
      savedLoadouts: [STARTER_LOADOUT],
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

describe("upgradePart", () => {
  it("raises a fitted part to level 1 for half its price and emits PartUpgraded", () => {
    const { deps, slices, snapshot } = setup();
    const result = upgradePart(slices, "mech-1", GUN, DAY, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cost = GUN_COST * 0.5;
    expect(result.value.roster.mechs[0]?.loadout.upgrades).toEqual({
      [GUN]: 1,
    });
    expect(result.value.roster.savedLoadouts[0]).toBe(STARTER_LOADOUT);
    expect(result.value.economy.credits).toBe(10_000 - cost);
    expect(result.value.economy.ledger[0]).toMatchObject({
      amount: -cost,
      kind: "purchase",
      ref: "mech-1",
      day: DAY,
    });
    expect(result.value.events).toEqual([
      expect.objectContaining({ type: CREDITS_CHANGED }),
      {
        type: PART_UPGRADED,
        payload: { mechId: "mech-1", partId: GUN, from: 0, to: 1, cost },
      },
    ]);
    expect(slices).toEqual(snapshot);
  });

  it("prices each further level higher and keeps other parts' levels", () => {
    const { deps, slices } = setup(10_000, { [GUN]: 1, "legs-strider": 2 });
    const result = upgradePart(slices, "mech-1", GUN, DAY, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.roster.mechs[0]?.loadout.upgrades).toEqual({
      [GUN]: 2,
      "legs-strider": 2,
    });
    expect(result.value.economy.credits).toBe(10_000 - GUN_COST * 0.5 * 2);
  });

  it("refuses a part already at the maximum level", () => {
    const { deps, slices, snapshot } = setup(10_000, {
      [GUN]: UPGRADE_TUNING.maxLevel,
    });
    const result = upgradePart(slices, "mech-1", GUN, DAY, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "max-upgrade-level",
      mechId: "mech-1",
      partId: GUN,
      level: 3,
    });
    expect(describeRosterError(result.error)).toContain("level 3");
    expect(slices).toEqual(snapshot);
  });

  it("rejects an unknown mech, a part the mech does not carry, and a part missing from the catalogue", () => {
    const { deps, slices } = setup();
    expect(upgradePart(slices, "mech-9", GUN, DAY, deps)).toMatchObject({
      ok: false,
      error: { code: "unknown-mech", mechId: "mech-9" },
    });
    expect(
      upgradePart(slices, "mech-1", "legs-jumper", DAY, deps),
    ).toMatchObject({
      ok: false,
      error: {
        code: "part-not-fitted",
        mechId: "mech-1",
        partId: "legs-jumper",
      },
    });
    const narrowed: UpgradeServiceDeps = {
      ...deps,
      parts: new StaticPartCatalogue(STARTER_PARTS.filter((p) => p.id !== GUN)),
    };
    expect(upgradePart(slices, "mech-1", GUN, DAY, narrowed)).toMatchObject({
      ok: false,
      error: { code: "unknown-part", partId: GUN },
    });
  });

  it("rejects an unaffordable upgrade with nothing changed", () => {
    const { deps, slices, snapshot } = setup(GUN_COST * 0.5 - 1);
    const result = upgradePart(slices, "mech-1", GUN, DAY, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: GUN_COST * 0.5,
      available: GUN_COST * 0.5 - 1,
    });
    expect(slices).toEqual(snapshot);
  });
});
