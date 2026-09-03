import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { EVENT_TYPES } from "../data/event-types";
import type { CampaignState } from "../model/campaign-state";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import { EVENT_RESOLVED } from "../model/event-resolved-event";
import type { EventType, EventTypeId } from "../model/event-type";
import { EVENT_TYPE_IDS } from "../model/event-type";
import type { PendingEvent } from "../model/pending-event";
import { THREAT_CHANGED } from "../model/threat-changed-event";
import { DataEventTypeCatalogue } from "../repository/event-type-catalogue";
import { buildEarthMap } from "./earth-map-builder";
import type { EventResolutionDeps } from "./event-resolution-service";
import { resolveEvent } from "./event-resolution-service";

// ===========================================
// Fixtures
// ===========================================

const DAY = 6;
const SHIPPED = new DataEventTypeCatalogue(
  EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
);

/** One type exercising every effect kind, plus a city-less one that tries a city effect. */
const KITCHEN_SINK: EventType = {
  id: "funding-review",
  title: "Kitchen sink",
  text: "Every effect at once.",
  requiresCity: true,
  weight: 1,
  choices: [
    {
      id: "all",
      label: "All",
      effects: [
        { kind: "credits", amount: -300 },
        { kind: "cityInfestation", delta: -15 },
        { kind: "threat", delta: 4 },
        { kind: "stipendMultiplier", factor: 1.5, days: 3 },
        { kind: "credits", amount: 100 },
      ],
    },
    {
      id: "clamp",
      label: "Clamp",
      effects: [
        { kind: "cityInfestation", delta: -500 },
        { kind: "threat", delta: 500 },
      ],
    },
    {
      id: "broke",
      label: "Broke",
      effects: [
        { kind: "threat", delta: -1 },
        { kind: "credits", amount: -99_999 },
      ],
    },
    {
      id: "noop",
      label: "Noop",
      effects: [{ kind: "cityInfestation", delta: 0 }],
    },
  ],
};

function pending(
  id: string,
  typeId: EventTypeId,
  cityId?: string,
): PendingEvent {
  return {
    id,
    typeId,
    ...(cityId === undefined ? {} : { cityId }),
    createdDay: 1,
    expiresDay: 9,
  };
}

function campaign(
  events: readonly PendingEvent[],
  credits = 5000,
  threat = 40,
): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
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
              {
                id: "a",
                name: "A",
                layout: { x: 0.1, y: 0.1 },
                infestation: 30,
              },
              { id: "b", name: "B", layout: { x: 0.2, y: 0.1 } },
            ],
          },
        ],
        links: [["a", "b"]],
      }),
      threat,
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: events,
      deployables: [],
      hives: [],
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits, ledger: [] },
  };
}

function deps(catalogue = SHIPPED): EventResolutionDeps {
  return {
    eventTypes: catalogue,
    transactions: new LedgerTransactionService(new SequentialIdGenerator()),
  };
}

function infestationOf(
  state: { overworld: CampaignState["overworld"] },
  id: string,
): number {
  return state.overworld.map.cities.find((c) => c.id === id)?.infestation ?? -1;
}

// ===========================================
// Effects
// ===========================================

describe("resolveEvent effects", () => {
  const sink = new DataEventTypeCatalogue([KITCHEN_SINK]);

  it("applies every effect kind in order and removes the event", () => {
    const state = campaign([pending("event-1", "funding-review", "a")]);
    const result = resolveEvent(state, "event-1", "all", DAY, deps(sink));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { overworld, economy, events } = result.value;
    expect(economy.credits).toBe(5000 - 300 + 100);
    expect(economy.ledger.map((t) => [t.kind, t.ref, t.amount, t.day])).toEqual(
      [
        ["event", "event-1", -300, DAY],
        ["event", "event-1", 100, DAY],
      ],
    );
    expect(infestationOf(result.value, "a")).toBe(15);
    expect(infestationOf(result.value, "b")).toBe(0);
    expect(overworld.threat).toBe(44);
    expect(overworld.threatOffset).toBe(4);
    expect(overworld.stipendModifiers).toEqual([{ factor: 1.5, daysLeft: 3 }]);
    expect(overworld.pendingEvents).toEqual([]);
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      CITY_INFESTATION_CHANGED,
      THREAT_CHANGED,
      CREDITS_CHANGED,
      EVENT_RESOLVED,
    ]);
    expect(events.at(-1)?.payload).toEqual({
      eventId: "event-1",
      typeId: "funding-review",
      choiceId: "all",
      cityId: "a",
    });
  });

  it("clamps infestation and threat to their ranges", () => {
    const state = campaign(
      [pending("event-1", "funding-review", "a")],
      5000,
      99,
    );
    const result = resolveEvent(state, "event-1", "clamp", DAY, deps(sink));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(infestationOf(result.value, "a")).toBe(0);
    expect(result.value.overworld.threat).toBe(100);
    expect(result.value.overworld.threatOffset).toBe(1);
    expect(result.value.events.map((e) => e.payload)).toEqual([
      { cityId: "a", from: 30, to: 0 },
      { from: 99, to: 100 },
      expect.objectContaining({ eventId: "event-1" }),
    ]);
  });

  it("emits no change event for a no-op effect", () => {
    const state = campaign([pending("event-1", "funding-review", "a")]);
    const result = resolveEvent(state, "event-1", "noop", DAY, deps(sink));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events.map((e) => e.type)).toEqual([EVENT_RESOLVED]);
    expect(result.value.overworld.map).toBe(state.overworld.map);
  });

  it("stacks a second stipend window beside an active one", () => {
    const base = campaign([pending("event-1", "funding-review", "a")]);
    const state: CampaignState = {
      ...base,
      overworld: {
        ...base.overworld,
        stipendModifiers: [{ factor: 0.5, daysLeft: 1 }],
      },
    };
    const result = resolveEvent(state, "event-1", "all", DAY, deps(sink));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overworld.stipendModifiers).toEqual([
      { factor: 0.5, daysLeft: 1 },
      { factor: 1.5, daysLeft: 3 },
    ]);
  });

  it("refuses an unaffordable charge and leaves everything untouched, even after earlier effects", () => {
    const state = campaign([pending("event-1", "funding-review", "a")], 50);
    const before = JSON.parse(JSON.stringify(state)) as CampaignState;
    const result = resolveEvent(state, "event-1", "broke", DAY, deps(sink));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "insufficient-credits",
      required: 99_999,
      available: 50,
    });
    expect(state).toEqual(before);
  });

  it("throws when a city-scoped effect runs on an event without a city", () => {
    const state = campaign([pending("event-1", "funding-review")]);
    expect(() =>
      resolveEvent(state, "event-1", "all", DAY, deps(sink)),
    ).toThrow(/no city/);
  });
});

// ===========================================
// Shipped content
// ===========================================

describe("resolveEvent with the shipped event types", () => {
  it("resolves every choice of every type without a per-event branch", () => {
    for (const type of SHIPPED.listEventTypes()) {
      for (const choice of type.choices) {
        const state = campaign(
          [pending("event-1", type.id, type.requiresCity ? "a" : undefined)],
          50_000,
        );
        const result = resolveEvent(state, "event-1", choice.id, DAY, deps());
        expect(result.ok, `${type.id}/${choice.id}`).toBe(true);
        if (!result.ok) continue;
        expect(result.value.overworld.pendingEvents).toEqual([]);
        expect(result.value.events.at(-1)?.type).toBe(EVENT_RESOLVED);
        expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
      }
    }
  });

  it("keeps other pending events and the map's untouched cities by identity", () => {
    const state = campaign([
      pending("event-1", "city-plea", "a"),
      pending("event-2", "research-find"),
    ]);
    const result = resolveEvent(state, "event-1", "send-relief", DAY, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.overworld.pendingEvents.map((e) => e.id)).toEqual([
      "event-2",
    ]);
    expect(result.value.overworld.map.cities[1]).toBe(
      state.overworld.map.cities[1],
    );
    expect(result.value.economy.credits).toBe(5000 - 600);
    expect(infestationOf(result.value, "a")).toBe(20);
  });
});

// ===========================================
// Errors
// ===========================================

describe("resolveEvent errors", () => {
  it("refuses an unknown event", () => {
    const result = resolveEvent(campaign([]), "ghost", "x", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "unknown-event", eventId: "ghost" });
  });

  it("refuses an event whose type the catalogue lacks", () => {
    const state = campaign([pending("event-1", "spore-shower", "a")]);
    const result = resolveEvent(
      state,
      "event-1",
      "let-it-fall",
      DAY,
      deps(new DataEventTypeCatalogue([EVENT_TYPES["city-plea"]])),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "unknown-event-type",
      eventId: "event-1",
      typeId: "spore-shower",
    });
  });

  it("refuses an unknown choice", () => {
    const state = campaign([pending("event-1", "city-plea", "a")]);
    const result = resolveEvent(state, "event-1", "bribe", DAY, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "unknown-choice",
      eventId: "event-1",
      choiceId: "bribe",
    });
  });
});
