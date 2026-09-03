import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { EVENT_TYPES } from "../data/event-types";
import type { CampaignState } from "../model/campaign-state";
import { EVENT_EXPIRED } from "../model/event-expired-event";
import { EVENT_OFFERED } from "../model/event-offered-event";
import { EVENT_RESOLVED } from "../model/event-resolved-event";
import type { EventType } from "../model/event-type";
import { EVENT_TYPE_IDS } from "../model/event-type";
import type { EventTuning } from "../model/event-tuning";
import type { PendingEvent } from "../model/pending-event";
import type { TickContext } from "../model/tick-step";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { buildEarthMap } from "./earth-map-builder";
import type { EventStepDeps } from "./event-generation-service";
import {
  createEventStep,
  EVENT_STEP_NAME,
  expireEvents,
  generateEvent,
} from "./event-generation-service";

// ===========================================
// Fixtures
// ===========================================

const SHIPPED = new DataEventTypeCatalogue(
  EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
);
const ALWAYS: EventTuning = { dailyEventChance: 1, expiryDays: 3 };
const NEVER: EventTuning = { dailyEventChance: 0, expiryDays: 3 };

/** Two cities: `a` infested, `b` clean. */
function campaign(
  overrides: {
    pendingEvents?: PendingEvent[];
    credits?: number;
    infestation?: number;
    day?: number;
  } = {},
): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld: {
      day: overrides.day ?? 5,
      map: buildEarthMap({
        regions: [
          {
            id: "west",
            name: "West",
            biome: "temperate",
            cities: [
              {
                id: "a",
                name: "A",
                layout: { x: 0.1, y: 0.1 },
                infestation: overrides.infestation ?? 40,
              },
              { id: "b", name: "B", layout: { x: 0.2, y: 0.1 } },
            ],
          },
        ],
        links: [["a", "b"]],
      }),
      threat: 30,
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: overrides.pendingEvents ?? [],
      deployables: [],
      hives: [],
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits: overrides.credits ?? 5000, ledger: [] },
  };
}

function pending(
  typeId: PendingEvent["typeId"],
  expiresDay: number,
  cityId?: string,
): PendingEvent {
  return {
    id: "event-1",
    typeId,
    ...(cityId === undefined ? {} : { cityId }),
    createdDay: 1,
    expiresDay,
  };
}

function ctx(
  day: number,
  seed = day,
  ids = new SequentialIdGenerator(),
): TickContext {
  return {
    day,
    rng: new Mulberry32Rng(seed),
    ids,
    modifiers: { suppression: {}, spreadDeterrence: {}, intelBonus: {} },
  };
}

function stepDeps(
  tuning: EventTuning = ALWAYS,
  catalogue = SHIPPED,
): EventStepDeps {
  return {
    eventTypes: catalogue,
    eventTuning: tuning,
    createTransactions: (ids) => new LedgerTransactionService(ids),
  };
}

function generate(
  state: CampaignState,
  seed: number,
  tuning = ALWAYS,
  catalogue = SHIPPED,
) {
  return generateEvent(state.overworld, {
    day: state.overworld.day,
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning,
    eventTypes: catalogue,
  });
}

// ===========================================
// Generation
// ===========================================

describe("generateEvent", () => {
  it("offers one event with an id, the day and the expiry from tuning", () => {
    const state = campaign();
    const { state: next, events } = generate(state, 1);
    expect(next.pendingEvents).toHaveLength(1);
    const event = next.pendingEvents[0];
    expect(event).toMatchObject({
      id: "event-1",
      createdDay: 5,
      expiresDay: 8,
    });
    expect(events).toEqual([{ type: EVENT_OFFERED, payload: { event } }]);
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const state = campaign();
    expect(generate(state, 7)).toEqual(generate(state, 7));
    const types = new Set(
      Array.from(
        { length: 40 },
        (_, i) => generate(state, i + 1).state.pendingEvents[0]?.typeId,
      ),
    );
    expect(types.size).toBeGreaterThan(1);
  });

  it("attaches an infested city exactly when the type requires one", () => {
    const state = campaign();
    for (let seed = 1; seed <= 60; seed++) {
      const event = generate(state, seed).state.pendingEvents[0];
      if (!event) throw new Error("expected an event");
      const type = EVENT_TYPES[event.typeId];
      if (type.requiresCity) {
        expect(event.cityId).toBe("a");
      } else {
        expect("cityId" in event).toBe(false);
      }
    }
  });

  it("offers only city-less types when no city is infested", () => {
    const state = campaign({ infestation: 0 });
    for (let seed = 1; seed <= 40; seed++) {
      const event = generate(state, seed).state.pendingEvents[0];
      if (!event) throw new Error("expected an event");
      expect(EVENT_TYPES[event.typeId].requiresCity).toBe(false);
    }
  });

  it("offers nothing when a catalogue has only city-bound types and nothing is infested", () => {
    const cityOnly = new DataEventTypeCatalogue(
      SHIPPED.listEventTypes().filter((t: EventType) => t.requiresCity),
    );
    const state = campaign({ infestation: 0 });
    const { state: next, events } = generate(state, 1, ALWAYS, cityOnly);
    expect(next).toBe(state.overworld);
    expect(events).toEqual([]);
  });

  it("offers nothing while an event is pending or when the roll fails", () => {
    const busy = campaign({ pendingEvents: [pending("research-find", 9)] });
    expect(generate(busy, 1).state).toBe(busy.overworld);
    const quiet = campaign();
    expect(generate(quiet, 1, NEVER).state).toBe(quiet.overworld);
  });

  it("draws types in proportion to their weights over many seeds", () => {
    const state = campaign();
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const id = generate(state, seed).state.pendingEvents[0]?.typeId ?? "none";
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get("city-plea") ?? 0).toBeGreaterThan(
      counts.get("research-find") ?? 0,
    );
    expect(counts.get("none") ?? 0).toBe(0);
  });
});

// ===========================================
// Expiry
// ===========================================

describe("expireEvents", () => {
  const deps = () => ({
    eventTypes: SHIPPED,
    transactions: new LedgerTransactionService(new SequentialIdGenerator()),
  });

  it("leaves unexpired events alone by identity", () => {
    const state = campaign({ pendingEvents: [pending("city-plea", 9, "a")] });
    const result = expireEvents(state, 8, deps());
    expect(result.overworld).toBe(state.overworld);
    expect(result.economy).toBe(state.economy);
    expect(result.events).toEqual([]);
  });

  it("applies the type's default choice on the expiry day and reports EventExpired", () => {
    const state = campaign({ pendingEvents: [pending("city-plea", 8, "a")] });
    const result = expireEvents(state, 8, deps());
    expect(result.overworld.pendingEvents).toEqual([]);
    expect(result.overworld.threat).toBe(33);
    expect(result.economy.credits).toBe(5000);
    expect(result.events.map((e) => e.type)).not.toContain(EVENT_RESOLVED);
    expect(result.events.at(-1)).toEqual({
      type: EVENT_EXPIRED,
      payload: {
        eventId: "event-1",
        typeId: "city-plea",
        cityId: "a",
        choiceId: "turn-away",
      },
    });
  });

  it("falls back to the first choice when a type names no default", () => {
    const noDefault: EventType = {
      ...EVENT_TYPES["research-find"],
      defaultChoiceId: undefined,
    };
    const catalogue = new DataEventTypeCatalogue([noDefault]);
    const state = campaign({ pendingEvents: [pending("research-find", 8)] });
    const result = expireEvents(state, 8, { ...deps(), eventTypes: catalogue });
    expect(result.events.at(-1)?.payload).toMatchObject({
      choiceId: "sell-specimen",
    });
    expect(result.economy.credits).toBe(6200);
    expect(result.events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      EVENT_EXPIRED,
    ]);
  });

  it("falls through to an affordable choice when the default cannot be paid", () => {
    const expensiveDefault: EventType = {
      ...EVENT_TYPES["city-plea"],
      defaultChoiceId: "send-relief",
    };
    const catalogue = new DataEventTypeCatalogue([expensiveDefault]);
    const state = campaign({
      pendingEvents: [pending("city-plea", 8, "a")],
      credits: 100,
    });
    const result = expireEvents(state, 8, { ...deps(), eventTypes: catalogue });
    expect(result.events.at(-1)?.payload).toMatchObject({
      choiceId: "turn-away",
    });
    expect(result.economy.credits).toBe(100);
    expect(result.overworld.pendingEvents).toEqual([]);
  });

  it("lapses without effect when no choice can be paid for", () => {
    const allCostly: EventType = {
      ...EVENT_TYPES["city-plea"],
      choices: [
        {
          id: "pay",
          label: "Pay",
          effects: [{ kind: "credits", amount: -999 }],
        },
        {
          id: "pay-more",
          label: "Pay more",
          effects: [{ kind: "credits", amount: -9999 }],
        },
      ],
      defaultChoiceId: "pay",
    };
    const catalogue = new DataEventTypeCatalogue([allCostly]);
    const state = campaign({
      pendingEvents: [pending("city-plea", 8, "a")],
      credits: 10,
    });
    const result = expireEvents(state, 8, { ...deps(), eventTypes: catalogue });
    expect(result.overworld.pendingEvents).toEqual([]);
    expect(result.economy).toBe(state.economy);
    expect(result.events).toEqual([
      {
        type: EVENT_EXPIRED,
        payload: { eventId: "event-1", typeId: "city-plea", cityId: "a" },
      },
    ]);
  });

  it("drops an event whose type the catalogue no longer knows", () => {
    const state = campaign({
      pendingEvents: [pending("spore-shower", 8, "a")],
    });
    const result = expireEvents(state, 8, {
      ...deps(),
      eventTypes: new DataEventTypeCatalogue([EVENT_TYPES["city-plea"]]),
    });
    expect(result.overworld.pendingEvents).toEqual([]);
    expect(result.events.map((e) => e.type)).toEqual([EVENT_EXPIRED]);
  });
});

// ===========================================
// Tick step
// ===========================================

describe("createEventStep", () => {
  it("is named for its RNG fork and does nothing on a quiet day", () => {
    const step = createEventStep<CampaignState>(stepDeps(NEVER));
    expect(step.name).toBe(EVENT_STEP_NAME);
    const state = campaign();
    const { state: next, events } = step.run(state, ctx(5));
    expect(next).toBe(state);
    expect(events).toEqual([]);
  });

  it("offers an event, holds it while pending, expires it by default, then offers again", () => {
    const ids = new SequentialIdGenerator();
    const step = createEventStep<CampaignState>(
      stepDeps({ dailyEventChance: 1, expiryDays: 2 }),
    );
    const day5 = step.run(campaign({ day: 5 }), ctx(5, 5, ids));
    expect(day5.events.map((e) => e.type)).toEqual([EVENT_OFFERED]);
    const first = day5.state.overworld.pendingEvents[0];
    expect(first?.expiresDay).toBe(7);

    const day6Input: CampaignState = {
      ...day5.state,
      overworld: { ...day5.state.overworld, day: 6 },
    };
    const day6 = step.run(day6Input, ctx(6, 6, ids));
    expect(day6.state).toBe(day6Input);
    expect(day6.events).toEqual([]);

    const day7 = step.run(
      { ...day6.state, overworld: { ...day6.state.overworld, day: 7 } },
      ctx(7, 7, ids),
    );
    const types = day7.events.map((e) => e.type);
    expect(types).toContain(EVENT_EXPIRED);
    expect(types.at(-1)).toBe(EVENT_OFFERED);
    expect(day7.state.overworld.pendingEvents).toHaveLength(1);
    expect(day7.state.overworld.pendingEvents[0]?.id).toBe("event-2");
  });

  it("is deterministic for a seed", () => {
    const step = createEventStep<CampaignState>(stepDeps(ALWAYS));
    const a = step.run(campaign(), ctx(5, 99));
    const b = step.run(campaign(), ctx(5, 99));
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a.state))).toEqual(a.state);
  });
});
