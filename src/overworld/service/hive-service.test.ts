import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { HIVE_TUNING } from "../data/hive-tuning";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { EarthMap } from "../model/earth-map";
import type { Hive } from "../model/hive";
import { HIVE_FORMED } from "../model/hive-formed-event";
import type { OverworldState } from "../model/overworld-state";
import { createInitialCampaignProgress } from "./campaign-progress-factory";
import { buildEarthMap } from "./earth-map-builder";
import {
  formFirstHive,
  formHive,
  hiveInRegion,
  hiveRegionIds,
  liberateRegion,
} from "./hive-service";

// ===========================================
// Fixtures
// ===========================================

/**
 * Three regions in map order: west (w1–w4), east (e1–e2), south (s1).
 * Infestations are set per test with `levels`.
 */
function earth(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "w1", name: "W1", layout: { x: 0.1, y: 0.1 } },
          { id: "w2", name: "W2", layout: { x: 0.2, y: 0.1 } },
          { id: "w3", name: "W3", layout: { x: 0.3, y: 0.1 } },
          { id: "w4", name: "W4", layout: { x: 0.4, y: 0.1 } },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          { id: "e1", name: "E1", layout: { x: 0.8, y: 0.1 } },
          { id: "e2", name: "E2", layout: { x: 0.9, y: 0.1 } },
        ],
      },
      {
        id: "south",
        name: "South",
        biome: "tropical",
        cities: [{ id: "s1", name: "S1", layout: { x: 0.5, y: 0.8 } }],
      },
    ],
    links: [
      ["w1", "w2"],
      ["w2", "w3"],
      ["w3", "w4"],
      ["w4", "e1"],
      ["e1", "e2"],
      ["e2", "s1"],
    ],
  });
}

/** An Act II overworld on day 20 over `earth()` with the given city levels. */
function overworld(
  levels: Readonly<Record<string, number>>,
  extra: Partial<OverworldState> = {},
): OverworldState {
  const map = earth();
  return {
    day: 20,
    map: {
      ...map,
      cities: map.cities.map((c) => ({
        ...c,
        infestation: levels[c.id] ?? 0,
        detected: (levels[c.id] ?? 0) > 0,
      })),
    },
    threat: 30,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
    progress: { ...createInitialCampaignProgress(), act: "act-2" },
    ...extra,
  };
}

/** Infestation by city id, for terse assertions. */
function levelsOf(state: OverworldState): Record<string, number> {
  return Object.fromEntries(state.map.cities.map((c) => [c.id, c.infestation]));
}

/** Deep snapshot to prove an input was not mutated. */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const WEST_HIVE: Hive = { id: "hive-4", regionId: "west", formedDay: 12 };
const EAST_HIVE: Hive = { id: "hive-5", regionId: "east", formedDay: 15 };

// ===========================================
// Queries
// ===========================================

describe("hiveInRegion and hiveRegionIds", () => {
  it("find the hive of a region and list every hive region", () => {
    const state = overworld({}, { hives: [WEST_HIVE, EAST_HIVE] });
    expect(hiveInRegion(state, "east")).toBe(EAST_HIVE);
    expect(hiveInRegion(state, "south")).toBeUndefined();
    expect([...hiveRegionIds(state)]).toEqual(["west", "east"]);
    expect(hiveRegionIds(overworld({})).size).toBe(0);
  });
});

// ===========================================
// formHive
// ===========================================

describe("formHive", () => {
  it("roots a hive with a hive-prefixed id on the day and announces it", () => {
    const before = overworld({ e1: 70 });
    const frozen = snapshot(before);
    const { state, events } = formHive(
      before,
      "east",
      20,
      new SequentialIdGenerator(),
    );
    const hive = { id: "hive-1", regionId: "east", formedDay: 20 };
    expect(state.hives).toEqual([hive]);
    expect(events).toEqual([{ type: HIVE_FORMED, payload: { hive } }]);
    expect(state.map).toBe(before.map);
    expect(before).toEqual(frozen);
  });

  it("is idempotent per region: a second call changes nothing and draws no id", () => {
    const ids = new SequentialIdGenerator();
    const once = formHive(overworld({}), "east", 20, ids);
    const counters = ids.getState();
    const twice = formHive(once.state, "east", 27, ids);
    expect(twice.state).toBe(once.state);
    expect(twice.events).toEqual([]);
    expect(twice.state.hives).toHaveLength(1);
    expect(ids.getState()).toEqual(counters);
  });

  it("clears the region's formation streak and keeps the others", () => {
    const ids = new SequentialIdGenerator();
    const watched = overworld({}, { hiveWatch: { east: 6, west: 2 } });
    expect(formHive(watched, "east", 20, ids).state.hiveWatch).toEqual({
      west: 2,
    });
    const alone = overworld({}, { hiveWatch: { east: 6 } });
    expect("hiveWatch" in formHive(alone, "east", 20, ids).state).toBe(false);
  });

  it("rejects a region that is not on the map", () => {
    expect(() =>
      formHive(overworld({}), "atlantis", 20, new SequentialIdGenerator()),
    ).toThrow(RangeError);
  });
});

// ===========================================
// formFirstHive
// ===========================================

describe("formFirstHive", () => {
  it("forms the hive in the region with the highest mean infestation", () => {
    // west mean 40, east mean 55, south 50.
    const state = overworld({ w1: 80, w2: 80, e1: 60, e2: 50, s1: 50 });
    const { state: next, events } = formFirstHive(
      state,
      20,
      new SequentialIdGenerator(),
    );
    expect(next.hives).toEqual([
      { id: "hive-1", regionId: "east", formedDay: 20 },
    ]);
    expect(events.map((e) => e.type)).toEqual([HIVE_FORMED]);
  });

  it("breaks a tie by map order", () => {
    // west mean 50, east mean 50, south 50.
    const state = overworld({ w1: 100, w2: 100, e1: 50, e2: 50, s1: 50 });
    const { state: next } = formFirstHive(
      state,
      20,
      new SequentialIdGenerator(),
    );
    expect(next.hives.map((h) => h.regionId)).toEqual(["west"]);
  });

  it("passes over a region that already holds a hive", () => {
    const state = overworld(
      { w1: 100, w2: 100, w3: 100, w4: 100, e1: 50, s1: 70 },
      { hives: [WEST_HIVE] },
    );
    const { state: next } = formFirstHive(
      state,
      20,
      new SequentialIdGenerator(),
    );
    expect(next.hives.map((h) => h.regionId)).toEqual(["west", "south"]);
  });

  it("changes nothing when every region already holds a hive", () => {
    const state = overworld(
      {},
      {
        hives: [
          WEST_HIVE,
          EAST_HIVE,
          { id: "hive-6", regionId: "south", formedDay: 18 },
        ],
      },
    );
    const result = formFirstHive(state, 20, new SequentialIdGenerator());
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});

// ===========================================
// liberateRegion
// ===========================================

describe("liberateRegion", () => {
  it("removes the hive, cuts each city in its region by 20 and pauses growth for 10 days", () => {
    const before = overworld(
      { w1: 70, w2: 50, w3: 10, e1: 90, e2: 80, s1: 40 },
      {
        hives: [WEST_HIVE, EAST_HIVE],
        growthPausedUntil: { south: 18 },
      },
    );
    const frozen = snapshot(before);
    const { state, events } = liberateRegion(before, "hive-4", 20, HIVE_TUNING);

    expect(state.hives).toEqual([EAST_HIVE]);
    expect(levelsOf(state)).toEqual({
      w1: 50,
      w2: 30,
      w3: 0,
      w4: 0,
      e1: 90,
      e2: 80,
      s1: 40,
    });
    expect(events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "w1", from: 70, to: 50 },
      },
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "w2", from: 50, to: 30 },
      },
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "w3", from: 10, to: 0 },
      },
    ]);
    // Liberated on day 20: ticks 21–30 are paused, day 31 grows again.
    expect(state.growthPausedUntil).toEqual({ south: 18, west: 31 });
    expect(before).toEqual(frozen);
  });

  it("forgets a city it clears to zero and keeps unchanged cities by identity", () => {
    const before = overworld({ w1: 15, e1: 90 }, { hives: [WEST_HIVE] });
    const { state } = liberateRegion(before, "hive-4", 20, HIVE_TUNING);
    const w1 = state.map.cities.find((c) => c.id === "w1");
    expect(w1?.infestation).toBe(0);
    expect(w1?.detected).toBe(false);
    const e1 = before.map.cities.find((c) => c.id === "e1");
    expect(state.map.cities.find((c) => c.id === "e1")).toBe(e1);
  });

  it("follows the tuned cut and pause", () => {
    const before = overworld({ e1: 90, e2: 30 }, { hives: [EAST_HIVE] });
    const { state } = liberateRegion(before, "hive-5", 8, {
      liberationCut: 35,
      liberationGrowthPauseDays: 3,
    });
    expect(levelsOf(state)).toMatchObject({ e1: 55, e2: 0 });
    expect(state.growthPausedUntil).toEqual({ east: 12 });
  });

  it("changes nothing for a hive that is not standing", () => {
    const before = overworld({ w1: 70 }, { hives: [EAST_HIVE] });
    const result = liberateRegion(before, "hive-4", 20, HIVE_TUNING);
    expect(result.state).toBe(before);
    expect(result.events).toEqual([]);
  });
});
