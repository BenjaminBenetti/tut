import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { EVENT_TYPES } from "../data/event-types";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import { UNKNOWN_COMMAND } from "../model/command-dispatcher";
import { EVENT_RESOLVED } from "../model/event-resolved-event";
import { EVENT_TYPE_IDS } from "../model/event-type";
import { resolveEvent } from "../model/resolve-event-command";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { createOverworldCommandDispatcher } from "./command-dispatcher";
import { buildEarthMap } from "./earth-map-builder";
import type { EventHandlerDeps } from "./event-command-handlers";
import { registerEventCommands } from "./event-command-handlers";

const DAY = 4;

const BASE: CampaignState = {
  meta: {
    rng: new Mulberry32Rng(1).getState(),
    ids: { counters: { txn: 5 } },
  },
  overworld: {
    day: DAY,
    map: buildEarthMap({
      regions: [
        {
          id: "west",
          name: "West",
          biome: "temperate",
          cities: [
            { id: "a", name: "A", layout: { x: 0.1, y: 0.1 }, infestation: 40 },
          ],
        },
      ],
      links: [],
    }),
    threat: 20,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [
      {
        id: "event-1",
        typeId: "city-plea",
        cityId: "a",
        createdDay: 1,
        expiresDay: 9,
      },
    ],
    deployables: [],
    hives: [],
  },
  roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
  economy: { credits: 1000, ledger: [] },
};

const DEPS: EventHandlerDeps = {
  eventTypes: new DataEventTypeCatalogue(
    EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
  ),
  transactionsFor: (ids) => new LedgerTransactionService(ids),
};

function dispatcher(): CommandDispatcher<CampaignState> {
  const d = createOverworldCommandDispatcher<CampaignState>();
  registerEventCommands(d, DEPS);
  return d;
}

describe("registerEventCommands", () => {
  it("registers ResolveEvent and leaves others unknown", () => {
    const d = dispatcher();
    expect(d.process(BASE, resolveEvent("event-1", "turn-away")).ok).toBe(true);
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
    expect(() => registerEventCommands(d, DEPS)).toThrow(/Duplicate handler/);
  });
});

describe("ResolveEvent through the dispatcher", () => {
  it("applies the choice with the campaign day and ids, and writes counters back", () => {
    const outcome = dispatcher().process(
      BASE,
      resolveEvent("event-1", "send-relief"),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { state, events } = outcome.value;
    expect(state.economy.credits).toBe(400);
    expect(
      state.economy.ledger.map((t) => [t.id, t.kind, t.ref, t.day]),
    ).toEqual([["txn-5", "event", "event-1", DAY]]);
    expect(state.overworld.map.cities[0]?.infestation).toBe(30);
    expect(state.overworld.pendingEvents).toEqual([]);
    expect(state.meta.ids.counters).toEqual({ txn: 6 });
    expect(state.roster).toBe(BASE.roster);
    expect(events.at(-1)?.type).toBe(EVENT_RESOLVED);
  });

  it.each([
    ["event", resolveEvent("ghost", "turn-away"), "unknown-event"],
    ["choice", resolveEvent("event-1", "bribe"), "unknown-choice"],
  ] as const)(
    "unknown %s folds into a CommandError with the resolution code",
    (_n, command, code) => {
      const outcome = dispatcher().process(BASE, command);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.error.code).toBe(code);
      expect(outcome.error.message.length).toBeGreaterThan(0);
    },
  );

  it("leaves the campaign untouched, counters included, on an unaffordable choice", () => {
    const poor: CampaignState = {
      ...BASE,
      economy: { credits: 10, ledger: [] },
    };
    const outcome = dispatcher().process(
      poor,
      resolveEvent("event-1", "send-relief"),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.code).toBe("insufficient-credits");
    expect(poor.meta.ids.counters).toEqual({ txn: 5 });
  });
});
