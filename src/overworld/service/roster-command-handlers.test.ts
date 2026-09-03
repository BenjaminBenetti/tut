import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import {
  LOADOUT_DELETED,
  LOADOUT_SAVED,
  MECH_BUILT,
  SQUAD_HIRED,
  SQUAD_REINFORCED,
} from "../../roster/model/roster-event";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import { UNKNOWN_COMMAND } from "../model/command-dispatcher";
import type { OverworldCommand } from "../model/overworld-command";
import {
  buildMech,
  deleteLoadout,
  hireSquad,
  reinforceSquad,
  saveLoadout,
} from "../model/overworld-command";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import type { RosterHandlerDeps } from "./roster-command-handlers";
import { registerRosterCommands } from "./roster-command-handlers";

// ===========================================
// Fixtures
// ===========================================

const DAY = 7;

const BASE: CampaignState = {
  meta: {
    rng: new Mulberry32Rng(1).getState(),
    ids: { counters: { squad: 3, txn: 2 } },
  },
  overworld: {
    day: DAY,
    map: { regions: [], cities: [] },
    threat: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
  },
  roster: {
    squads: [
      {
        id: "squad-1",
        name: "Alpha",
        typeId: "rifle",
        strength: 4,
        maxStrength: 5,
        kills: 0,
        missionsSurvived: 0,
        xp: 0,
      },
    ],
    mechs: [],
    savedLoadouts: [STARTER_LOADOUT],
  },
  economy: { credits: 20_000, ledger: [] },
};

const DEPS: RosterHandlerDeps = {
  squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
  parts: new StaticPartCatalogue(STARTER_PARTS),
  rating: MECH_RATING_TUNING,
  transactionsFor: (ids) => new LedgerTransactionService(ids),
};

/** A dispatcher with only the roster commands registered. */
function dispatcher(): CommandDispatcher<CampaignState> {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerRosterCommands(d, DEPS);
  return d;
}

/** Dispatches, unwrapping a success. */
function apply(command: OverworldCommand): {
  state: CampaignState;
  types: string[];
} {
  const outcome = dispatcher().process(BASE, command);
  if (!outcome.ok) {
    throw new Error(
      `expected ok, got ${outcome.error.code}: ${outcome.error.message}`,
    );
  }
  return {
    state: outcome.value.state,
    types: outcome.value.events.map((e) => e.type),
  };
}

// ===========================================
// Tests
// ===========================================

describe("registerRosterCommands", () => {
  it("registers every roster command and leaves others unknown", () => {
    const d = dispatcher();
    const commands: OverworldCommand[] = [
      hireSquad("rifle", "X"),
      reinforceSquad("squad-1", 1),
      saveLoadout({ ...STARTER_LOADOUT, name: "Brawler" }),
      deleteLoadout(STARTER_LOADOUT.name),
      buildMech(STARTER_LOADOUT.name, "X"),
    ];
    for (const command of commands) {
      expect(d.process(BASE, command).ok).toBe(true);
    }
    const unknown = d.process(BASE, {
      type: "overworld:advance-day",
      payload: {},
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error.code).toBe(UNKNOWN_COMMAND);
  });

  it("refuses to register twice", () => {
    const d = dispatcher();
    expect(() => registerRosterCommands(d, DEPS)).toThrow(/Duplicate handler/);
  });
});

describe("roster handlers through the dispatcher", () => {
  it("HireSquad draws ids from the campaign counters and writes them back", () => {
    const { state, types } = apply(hireSquad("rifle", "Delta"));
    expect(state.roster.squads.map((s) => s.id)).toEqual([
      "squad-1",
      "squad-3",
    ]);
    expect(state.economy.ledger.map((t) => [t.id, t.day])).toEqual([
      ["txn-2", DAY],
    ]);
    expect(state.meta.ids.counters).toEqual({ squad: 4, txn: 3 });
    expect(state.meta.rng).toEqual(BASE.meta.rng);
    expect(state.overworld).toBe(BASE.overworld);
    expect(types).toEqual(["economy:credits-changed", SQUAD_HIRED]);
  });

  it("ReinforceSquad uses the campaign day", () => {
    const { state, types } = apply(reinforceSquad("squad-1", 1));
    expect(state.roster.squads[0]?.strength).toBe(5);
    expect(state.economy.ledger[0]?.day).toBe(DAY);
    expect(types).toContain(SQUAD_REINFORCED);
  });

  it("SaveLoadout and DeleteLoadout round-trip a template", () => {
    const brawler = { ...STARTER_LOADOUT, name: "Brawler" };
    const saved = apply(saveLoadout(brawler));
    expect(saved.state.roster.savedLoadouts.map((l) => l.name)).toEqual([
      STARTER_LOADOUT.name,
      "Brawler",
    ]);
    expect(saved.types).toEqual([LOADOUT_SAVED]);

    const deleted = dispatcher().process(saved.state, deleteLoadout("Brawler"));
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.state.roster.savedLoadouts).toEqual([STARTER_LOADOUT]);
    expect(deleted.value.events.map((e) => e.type)).toEqual([LOADOUT_DELETED]);
  });

  it("BuildMech charges the sheet cost and names the mech", () => {
    const { state, types } = apply(buildMech(STARTER_LOADOUT.name, "Anvil"));
    expect(state.roster.mechs.map((m) => [m.id, m.name])).toEqual([
      ["mech-1", "Anvil"],
    ]);
    expect(state.economy.credits).toBe(20_000 - 3250);
    expect(state.meta.ids.counters).toEqual({ squad: 3, txn: 3, mech: 2 });
    expect(types).toEqual(["economy:credits-changed", MECH_BUILT]);
  });

  it.each([
    ["HireSquad", hireSquad("cavalry", "X"), "unknown-squad-type"],
    ["ReinforceSquad", reinforceSquad("squad-9", 1), "unknown-squad"],
    [
      "SaveLoadout",
      saveLoadout({ ...STARTER_LOADOUT, legsId: "" }),
      "invalid-loadout",
    ],
    ["DeleteLoadout", deleteLoadout("Ghost"), "unknown-loadout"],
    ["BuildMech", buildMech("Ghost", "X"), "unknown-loadout"],
  ] as const)(
    "%s folds a roster error into a CommandError with the roster code",
    (_name, command, code) => {
      const outcome = dispatcher().process(BASE, command);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe(code);
      expect(outcome.error.message.length).toBeGreaterThan(0);
    },
  );

  it("leaves the campaign untouched, counters included, on an unaffordable build", () => {
    const poor: CampaignState = {
      ...BASE,
      economy: { credits: 10, ledger: [] },
    };
    const outcome = dispatcher().process(
      poor,
      buildMech(STARTER_LOADOUT.name, "X"),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("insufficient-credits");
    expect(outcome.error.message).toContain("3250");
  });
});
