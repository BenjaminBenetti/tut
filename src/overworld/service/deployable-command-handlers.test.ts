import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import { buildDeployable } from "../model/build-deployable-command";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import { UNKNOWN_COMMAND } from "../model/command-dispatcher";
import { decommissionDeployable } from "../model/decommission-deployable-command";
import { DEPLOYABLE_BUILT } from "../model/deployable-built-event";
import { DEPLOYABLE_REMOVED } from "../model/deployable-removed-event";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import type { DeployableHandlerDeps } from "./deployable-command-handlers";
import { registerDeployableCommands } from "./deployable-command-handlers";
import { buildEarthMap } from "./earth-map-builder";

// ===========================================
// Fixtures
// ===========================================

const DAY = 4;
const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];

const BASE: CampaignState = {
  meta: {
    rng: new Mulberry32Rng(1).getState(),
    ids: { counters: { txn: 5, deployable: 2 } },
  },
  overworld: {
    day: DAY,
    map: buildEarthMap({
      regions: [
        {
          id: "west",
          name: "West",
          biome: "temperate",
          cities: [{ id: "a", name: "A", layout: { x: 0.1, y: 0.1 } }],
        },
      ],
      links: [],
    }),
    threat: 0,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [
      {
        id: "deployable-1",
        typeId: "sensor-array",
        regionId: "west",
        builtDay: 1,
        online: true,
      },
    ],
    hives: [],
  },
  roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
  economy: { credits: 10_000, ledger: [] },
};

const DEPS: DeployableHandlerDeps = {
  catalogue: new DataDeployableTypeCatalogue(
    DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
  ),
  transactionsFor: (ids) => new LedgerTransactionService(ids),
};

/** A dispatcher with only the deployable commands registered. */
function dispatcher(): CommandDispatcher<CampaignState> {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerDeployableCommands(d, DEPS);
  return d;
}

// ===========================================
// Tests
// ===========================================

describe("registerDeployableCommands", () => {
  it("registers both commands and leaves others unknown", () => {
    const d = dispatcher();
    expect(
      d.process(BASE, buildDeployable("defensive-battery", "west")).ok,
    ).toBe(true);
    expect(d.process(BASE, decommissionDeployable("deployable-1")).ok).toBe(
      true,
    );
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
    expect(() => registerDeployableCommands(d, DEPS)).toThrow(
      /Duplicate handler/,
    );
  });
});

describe("deployable handlers through the dispatcher", () => {
  it("BuildDeployable draws ids from the campaign counters, uses the campaign day and writes back", () => {
    const outcome = dispatcher().process(
      BASE,
      buildDeployable("defensive-battery", "west"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { state, events } = outcome.value;
    expect(state.overworld.deployables.map((d) => d.id)).toEqual([
      "deployable-1",
      "deployable-2",
    ]);
    expect(state.overworld.deployables[1]?.builtDay).toBe(DAY);
    expect(state.economy.credits).toBe(10_000 - BATTERY.buildCost);
    expect(state.economy.ledger.map((t) => [t.id, t.ref, t.day])).toEqual([
      ["txn-5", "deployable-2", DAY],
    ]);
    expect(state.meta.ids.counters).toEqual({ txn: 6, deployable: 3 });
    expect(state.meta.rng).toEqual(BASE.meta.rng);
    expect(state.roster).toBe(BASE.roster);
    expect(events.map((e) => e.type)).toEqual([
      "economy:credits-changed",
      DEPLOYABLE_BUILT,
    ]);
  });

  it("DecommissionDeployable removes without a ledger entry", () => {
    const outcome = dispatcher().process(
      BASE,
      decommissionDeployable("deployable-1"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.state.overworld.deployables).toEqual([]);
    expect(outcome.value.state.economy).toEqual(BASE.economy);
    expect(outcome.value.events.map((e) => e.type)).toEqual([
      DEPLOYABLE_REMOVED,
    ]);
  });

  it.each([
    ["cap", buildDeployable("sensor-array", "west"), "region-cap-reached"],
    ["region", buildDeployable("sensor-array", "mars"), "unknown-region"],
    ["decommission", decommissionDeployable("ghost"), "unknown-deployable"],
  ] as const)(
    "%s error folds into a CommandError with the deployable code",
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
      buildDeployable("defensive-battery", "west"),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("insufficient-credits");
    expect(outcome.error.message).toContain(String(BATTERY.buildCost));
    expect(poor.meta.ids.counters).toEqual({ txn: 5, deployable: 2 });
  });
});
