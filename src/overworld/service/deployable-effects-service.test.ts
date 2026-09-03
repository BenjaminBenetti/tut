import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { CREDITS_CHANGED } from "../../economy/model/economy-event";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import type { CampaignState } from "../model/campaign-state";
import type { Deployable } from "../model/deployable";
import type { DeployableType } from "../model/deployable-type";
import { DEPLOYABLE_TYPE_IDS } from "../model/deployable-type";
import type { EarthMap } from "../model/earth-map";
import {
  DEPLOYABLE_OFFLINE,
  DEPLOYABLE_ONLINE,
} from "../model/overworld-domain-event";
import { DataDeployableTypeCatalogue } from "../repository/deployable-type-catalogue";
import { buildEarthMap } from "./earth-map-builder";
import type { UpkeepDeps } from "./deployable-effects-service";
import { chargeUpkeep, computeModifiers } from "./deployable-effects-service";

// ===========================================
// Fixtures
// ===========================================

/** Two regions: west has two cities, east has one. */
function map(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "a", name: "A", layout: { x: 0.1, y: 0.1 }, infestation: 20 },
          { id: "b", name: "B", layout: { x: 0.2, y: 0.1 } },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [{ id: "c", name: "C", layout: { x: 0.8, y: 0.1 } }],
      },
    ],
    links: [
      ["a", "b"],
      ["b", "c"],
    ],
  });
}

/** Shipped catalogue: battery suppression 2, repellent 0.5, sensor +2 days. */
const CATALOGUE = new DataDeployableTypeCatalogue(
  DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
);

const BATTERY = DEPLOYABLE_TYPES["defensive-battery"];
const REPELLENT = DEPLOYABLE_TYPES["repellent-dispersal"];
const SENSOR = DEPLOYABLE_TYPES["sensor-array"];

/** Builds a deployable with sensible defaults. */
function deployable(
  id: string,
  typeId: DeployableType["id"],
  regionId: string,
  online = true,
): Deployable {
  return { id, typeId, regionId, builtDay: 1, online };
}

/** A campaign with the given deployables and treasury. */
function campaign(
  deployables: readonly Deployable[],
  credits: number,
): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld: {
      day: 3,
      map: map(),
      threat: 10,
      threatOffset: 0,
      spreadCooldowns: {},
      missions: [],
      pendingEvents: [],
      deployables,
      hives: [],
    },
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits, ledger: [] },
  };
}

/** Fresh deps so each test's ledger ids start at 1. */
function deps(): UpkeepDeps {
  return {
    catalogue: CATALOGUE,
    transactions: new LedgerTransactionService(new SequentialIdGenerator()),
  };
}

/** Online flags by deployable id. */
function online(state: CampaignState): Record<string, boolean> {
  return Object.fromEntries(
    state.overworld.deployables.map((d) => [d.id, d.online]),
  );
}

// ===========================================
// Modifiers
// ===========================================

describe("computeModifiers", () => {
  it("returns empty maps with no deployables", () => {
    expect(computeModifiers(campaign([], 0).overworld, CATALOGUE)).toEqual({
      suppression: {},
      spreadDeterrence: {},
      intelBonus: {},
    });
  });

  it("applies battery suppression to every city in the region and sums batteries", () => {
    const one = campaign([deployable("d1", "defensive-battery", "west")], 0);
    expect(computeModifiers(one.overworld, CATALOGUE).suppression).toEqual({
      a: BATTERY.effect.suppression,
      b: BATTERY.effect.suppression,
    });

    const two = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        deployable("d2", "defensive-battery", "west"),
        deployable("d3", "defensive-battery", "east"),
      ],
      0,
    );
    const s = BATTERY.effect.suppression ?? 0;
    expect(computeModifiers(two.overworld, CATALOGUE).suppression).toEqual({
      a: 2 * s,
      b: 2 * s,
      c: s,
    });
  });

  it("stacks deterrence multiplicatively and never past 1", () => {
    const state = campaign(
      [
        deployable("d1", "repellent-dispersal", "west"),
        deployable("d2", "repellent-dispersal", "west"),
      ],
      0,
    );
    const d = REPELLENT.effect.spreadDeterrence ?? 0;
    const { spreadDeterrence } = computeModifiers(state.overworld, CATALOGUE);
    expect(spreadDeterrence.west).toBeCloseTo(1 - (1 - d) * (1 - d));
    expect(spreadDeterrence.west).toBeLessThanOrEqual(1);
    expect(spreadDeterrence.east).toBeUndefined();
  });

  it("sums intel bonus per region", () => {
    const state = campaign(
      [
        deployable("d1", "sensor-array", "east"),
        deployable("d2", "sensor-array", "east"),
        deployable("d3", "sensor-array", "west"),
      ],
      0,
    );
    const i = SENSOR.effect.intelBonus ?? 0;
    expect(computeModifiers(state.overworld, CATALOGUE).intelBonus).toEqual({
      east: 2 * i,
      west: i,
    });
  });

  it("ignores offline deployables", () => {
    const state = campaign(
      [
        deployable("d1", "defensive-battery", "west", false),
        deployable("d2", "repellent-dispersal", "west", false),
        deployable("d3", "sensor-array", "east", false),
      ],
      0,
    );
    expect(computeModifiers(state.overworld, CATALOGUE)).toEqual({
      suppression: {},
      spreadDeterrence: {},
      intelBonus: {},
    });
  });

  it("produces maps the growth and spread services accept as inputs", () => {
    const state = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        deployable("d2", "repellent-dispersal", "east"),
      ],
      0,
    );
    const mods = computeModifiers(state.overworld, CATALOGUE);
    for (const value of Object.values(mods.suppression)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    for (const value of Object.values(mods.spreadDeterrence)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(JSON.parse(JSON.stringify(mods))).toEqual(mods);
  });

  it("throws on a deployable with an unknown type", () => {
    const state = campaign(
      [deployable("d1", "orbital-laser" as DeployableType["id"], "west")],
      0,
    );
    expect(() => computeModifiers(state.overworld, CATALOGUE)).toThrow(
      /unknown type "orbital-laser"/,
    );
  });
});

// ===========================================
// Upkeep
// ===========================================

describe("chargeUpkeep", () => {
  it("charges each online deployable once, in order, with a ledger entry per charge", () => {
    const state = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        deployable("d2", "sensor-array", "east"),
      ],
      1000,
    );
    const { state: next, events } = chargeUpkeep(state, 3, deps());
    const total = BATTERY.upkeepPerDay + SENSOR.upkeepPerDay;
    expect(next.economy.credits).toBe(1000 - total);
    expect(
      next.economy.ledger.map((t) => [t.kind, t.ref, t.amount, t.day]),
    ).toEqual([
      ["upkeep", "d1", -BATTERY.upkeepPerDay, 3],
      ["upkeep", "d2", -SENSOR.upkeepPerDay, 3],
    ]);
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      CREDITS_CHANGED,
    ]);
    expect(online(next)).toEqual({ d1: true, d2: true });
  });

  it("takes an unaffordable deployable offline without going negative", () => {
    const state = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        deployable("d2", "sensor-array", "east"),
      ],
      BATTERY.upkeepPerDay + SENSOR.upkeepPerDay - 1,
    );
    const { state: next, events } = chargeUpkeep(state, 3, deps());
    expect(next.economy.credits).toBe(SENSOR.upkeepPerDay - 1);
    expect(online(next)).toEqual({ d1: true, d2: false });
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      DEPLOYABLE_OFFLINE,
    ]);
    expect(events[1]?.payload).toEqual({
      deployableId: "d2",
      typeId: "sensor-array",
      regionId: "east",
    });
    expect(next.overworld.deployables[0]).toBe(state.overworld.deployables[0]);
  });

  it("takes everything offline with an empty treasury and charges nothing", () => {
    const state = campaign(
      [
        deployable("d1", "defensive-battery", "west"),
        deployable("d2", "sensor-array", "east"),
      ],
      0,
    );
    const { state: next, events } = chargeUpkeep(state, 3, deps());
    expect(next.economy).toEqual(state.economy);
    expect(online(next)).toEqual({ d1: false, d2: false });
    expect(events.map((e) => e.type)).toEqual([
      DEPLOYABLE_OFFLINE,
      DEPLOYABLE_OFFLINE,
    ]);
  });

  it("keeps an unaffordable deployable offline silently on later days", () => {
    const state = campaign(
      [deployable("d1", "defensive-battery", "west", false)],
      0,
    );
    const { state: next, events } = chargeUpkeep(state, 4, deps());
    expect(events).toEqual([]);
    expect(next).toBe(state);
  });

  it("brings an offline deployable back online when upkeep can be paid", () => {
    const state = campaign(
      [deployable("d1", "defensive-battery", "west", false)],
      BATTERY.upkeepPerDay,
    );
    const { state: next, events } = chargeUpkeep(state, 5, deps());
    expect(online(next)).toEqual({ d1: true });
    expect(next.economy.credits).toBe(0);
    expect(events.map((e) => e.type)).toEqual([
      CREDITS_CHANGED,
      DEPLOYABLE_ONLINE,
    ]);
    expect(events[1]?.payload).toEqual({
      deployableId: "d1",
      typeId: "defensive-battery",
      regionId: "west",
    });
  });

  it("cycles offline and back across days as the treasury allows", () => {
    let state = campaign([deployable("d1", "sensor-array", "east")], 0);
    const d = deps();
    state = chargeUpkeep(state, 1, d).state;
    expect(online(state)).toEqual({ d1: false });
    state = {
      ...state,
      economy: { ...state.economy, credits: SENSOR.upkeepPerDay * 2 },
    };
    state = chargeUpkeep(state, 2, d).state;
    expect(online(state)).toEqual({ d1: true });
    state = chargeUpkeep(state, 3, d).state;
    expect(online(state)).toEqual({ d1: true });
    expect(state.economy.credits).toBe(0);
    state = chargeUpkeep(state, 4, d).state;
    expect(online(state)).toEqual({ d1: false });
  });

  it("leaves the campaign untouched with no deployables", () => {
    const state = campaign([], 500);
    const { state: next, events } = chargeUpkeep(state, 3, deps());
    expect(next).toBe(state);
    expect(events).toEqual([]);
  });

  it("never mutates its input and preserves the other slices", () => {
    const state = campaign([deployable("d1", "sensor-array", "east")], 100);
    const before = JSON.parse(JSON.stringify(state)) as CampaignState;
    const { state: next } = chargeUpkeep(state, 3, deps());
    expect(state).toEqual(before);
    expect(next.meta).toBe(state.meta);
    expect(next.roster).toBe(state.roster);
    expect(next.overworld.map).toBe(state.overworld.map);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  });

  it("throws on a deployable with an unknown type", () => {
    const state = campaign(
      [deployable("d1", "orbital-laser" as DeployableType["id"], "west")],
      100,
    );
    expect(() => chargeUpkeep(state, 3, deps())).toThrow(/unknown type/);
  });
});
