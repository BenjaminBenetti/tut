import { describe, expect, it } from "vitest";

import type { Rng } from "../../core/model/rng";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import {
  INFESTATION_SEEDED,
  INFESTATION_SPREAD,
} from "../model/overworld-domain-event";
import type { InfestationSeededEvent } from "../model/overworld-domain-event";
import type { SpreadCooldowns } from "../model/spread-cooldown";
import { buildEarthMap } from "./earth-map-builder";
import type {
  RegionDeterrence,
  SpreadRegionConditions,
} from "./infestation-spread-service";
import {
  applySpread,
  NO_SPREAD_CONDITIONS,
  seedProbability,
  spreadAmountFrom,
} from "./infestation-spread-service";

// ===========================================
// Fixtures
// ===========================================

/** Spread at 50 by 10 with a two-day cooldown; seed 1-in-2 at max threat. */
const TUNING: InfestationTuning = {
  ...INFESTATION_TUNING,
  spreadThreshold: 50,
  spreadAmount: 10,
  spreadCooldownDays: 2,
  seedChance: 0.5,
  seedAmount: 5,
};

/**
 * Five cities in two regions. `hot` is past the threshold with three
 * neighbours: two clean (`a`, `b`) and one already infested (`c`). `far`
 * is clean and only reachable through `c`.
 *
 *          a(0) ── hot(70) ── c(30) ── far(0)
 *                    │
 *                   b(0)
 */
function fixture(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "a", name: "A", layout: { x: 0.1, y: 0.1 } },
          {
            id: "hot",
            name: "Hot",
            layout: { x: 0.2, y: 0.1 },
            infestation: 70,
          },
          { id: "b", name: "B", layout: { x: 0.2, y: 0.3 } },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          { id: "c", name: "C", layout: { x: 0.8, y: 0.1 }, infestation: 30 },
          { id: "far", name: "Far", layout: { x: 0.9, y: 0.1 } },
        ],
      },
    ],
    links: [
      ["a", "hot"],
      ["hot", "b"],
      ["hot", "c"],
      ["c", "far"],
    ],
  });
}

/** Infestation by city id, for terse assertions. */
function levels(map: EarthMap): Record<string, number> {
  return Object.fromEntries(map.cities.map((c) => [c.id, c.infestation]));
}

/** Narrows a day's events to the seeding ones. */
function seededEvents(
  events: readonly { type: string; payload: unknown }[],
): InfestationSeededEvent[] {
  return events.filter(
    (e): e is InfestationSeededEvent => e.type === INFESTATION_SEEDED,
  );
}

/** Deep snapshot to prove an input was not mutated. */
function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Fresh generator for a seed, so every test starts its stream alike. */
function rng(seed: number): Rng {
  return new Mulberry32Rng(seed);
}

/** Runs one day with no deterrence and no cooldowns unless given. */
function day(
  map: EarthMap,
  threat: number,
  seed: number,
  options: {
    deterrence?: RegionDeterrence;
    cooldowns?: SpreadCooldowns;
    tuning?: InfestationTuning;
  } = {},
) {
  return applySpread(
    map,
    threat,
    options.deterrence ?? {},
    options.cooldowns ?? {},
    rng(seed),
    options.tuning ?? TUNING,
  );
}

// ===========================================
// Formula
// ===========================================

describe("seedProbability", () => {
  it("is the seed chance at max threat and scales linearly with threat", () => {
    expect(seedProbability(100, 0, TUNING)).toBe(0.5);
    expect(seedProbability(50, 0, TUNING)).toBe(0.25);
    expect(seedProbability(0, 0, TUNING)).toBe(0);
  });

  it("is dampened by deterrence down to zero", () => {
    expect(seedProbability(100, 0.5, TUNING)).toBe(0.25);
    expect(seedProbability(100, 1, TUNING)).toBe(0);
  });
});

// ===========================================
// Spread
// ===========================================

describe("applySpread: spread", () => {
  it("pushes spreadAmount into one least-infested neighbour and starts a cooldown", () => {
    const { state, events } = day(fixture(), 0, 1);
    const spread = events.filter((e) => e.type === INFESTATION_SPREAD);
    expect(spread).toHaveLength(1);
    const target = spread[0]?.payload.toCityId;
    expect(["a", "b"]).toContain(target);
    expect(spread[0]?.payload).toEqual({
      fromCityId: "hot",
      toCityId: target,
      amount: 10,
    });
    expect(levels(state.map)[target ?? ""]).toBe(10);
    expect(levels(state.map).c).toBe(30);
    expect(state.cooldowns).toEqual({ hot: 2 });
  });

  it("is deterministic for a fixed seed and varies across seeds", () => {
    const first = day(fixture(), 0, 42);
    const again = day(fixture(), 0, 42);
    expect(again).toEqual(first);

    const targets = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(
        (seed) => day(fixture(), 0, seed).events[0]?.payload,
      ),
    );
    expect(targets.size).toBeGreaterThan(1);
  });

  it("does not spread from a city below the threshold", () => {
    const { state, events } = day(fixture(), 0, 1, {
      tuning: { ...TUNING, spreadThreshold: 71 },
    });
    expect(events).toEqual([]);
    expect(state.cooldowns).toEqual({});
    expect(levels(state.map)).toEqual(levels(fixture()));
  });

  it("respects the cooldown and counts it down day by day", () => {
    const blocked = day(fixture(), 0, 1, { cooldowns: { hot: 2 } });
    expect(blocked.events).toEqual([]);
    expect(blocked.state.cooldowns).toEqual({ hot: 1 });

    const expired = day(fixture(), 0, 1, { cooldowns: { hot: 1 } });
    expect(expired.events).toHaveLength(1);
    expect(expired.state.cooldowns).toEqual({ hot: 2 });
  });

  it("spreads every cooldown-many days when replayed", () => {
    let map = fixture();
    let cooldowns: SpreadCooldowns = {};
    const spreadDays: number[] = [];
    const stream = rng(9);
    for (let d = 1; d <= 6; d++) {
      const { state, events } = applySpread(map, 0, {}, cooldowns, stream, {
        ...TUNING,
        spreadCooldownDays: 3,
      });
      if (events.some((e) => e.type === INFESTATION_SPREAD)) {
        spreadDays.push(d);
      }
      map = state.map;
      cooldowns = state.cooldowns;
    }
    expect(spreadDays).toEqual([1, 4]);
  });

  it("prefers the least-infested neighbour over an infested one", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const target = day(fixture(), 0, seed).events[0]?.payload;
      expect(target).not.toMatchObject({ toCityId: "c" });
    }
  });

  it("clamps at 100 and reports the amount actually added", () => {
    const map = buildEarthMap({
      regions: [
        {
          id: "r",
          name: "R",
          biome: "temperate",
          cities: [
            { id: "x", name: "X", layout: { x: 0.1, y: 0.1 }, infestation: 90 },
            { id: "y", name: "Y", layout: { x: 0.2, y: 0.1 }, infestation: 95 },
          ],
        },
      ],
      links: [["x", "y"]],
    });
    const { state, events } = day(map, 0, 1);
    expect(events.map((e) => e.payload)).toEqual([
      { fromCityId: "x", toCityId: "y", amount: 5 },
      { fromCityId: "y", toCityId: "x", amount: 10 },
    ]);
    expect(levels(state.map)).toEqual({ x: 100, y: 100 });
    expect(state.cooldowns).toEqual({ x: 2, y: 2 });
  });

  it("skips a city whose neighbours are all overrun, without a cooldown", () => {
    const map = buildEarthMap({
      regions: [
        {
          id: "r",
          name: "R",
          biome: "temperate",
          cities: [
            { id: "x", name: "X", layout: { x: 0.1, y: 0.1 }, infestation: 60 },
            {
              id: "y",
              name: "Y",
              layout: { x: 0.2, y: 0.1 },
              infestation: 100,
            },
          ],
        },
      ],
      links: [["x", "y"]],
    });
    const { state, events } = day(map, 0, 1);
    const spread = events.filter((e) => e.type === INFESTATION_SPREAD);
    expect(spread.map((e) => e.payload.fromCityId)).toEqual(["y"]);
    expect(state.cooldowns).toEqual({ y: 2 });
  });

  it("stacks spread from several sources into one target", () => {
    const map = buildEarthMap({
      regions: [
        {
          id: "r",
          name: "R",
          biome: "temperate",
          cities: [
            { id: "l", name: "L", layout: { x: 0.1, y: 0.1 }, infestation: 60 },
            { id: "m", name: "M", layout: { x: 0.2, y: 0.1 } },
            { id: "n", name: "N", layout: { x: 0.3, y: 0.1 }, infestation: 60 },
          ],
        },
      ],
      links: [
        ["l", "m"],
        ["m", "n"],
      ],
    });
    const { state } = day(map, 0, 1);
    expect(levels(state.map).m).toBe(20);
  });
});

// ===========================================
// Hives and growth pauses
// ===========================================

describe("spreadAmountFrom", () => {
  it("is spreadAmount outside a hive region and the rounded product inside one", () => {
    const hives = new Set(["west"]);
    const tuning = { ...TUNING, spreadAmount: 10, hiveSpreadMultiplier: 1.5 };
    expect(spreadAmountFrom("east", hives, tuning)).toBe(10);
    expect(spreadAmountFrom("west", hives, tuning)).toBe(15);
    expect(
      spreadAmountFrom("west", hives, { ...tuning, spreadAmount: 5 }),
    ).toBe(8);
  });
});

describe("applySpread: hives and growth pauses", () => {
  /**
   * The fixture with `c` past the threshold too, so each region has one
   * spreading city: `hot` (west) spreads into `a` or `b`, and `c` (east)
   * into `far`, its only neighbour below it.
   *
   *          a(0) ── hot(70) ── c(60) ── far(0)
   *                    │
   *                   b(0)
   */
  function twoSources(): EarthMap {
    const map = fixture();
    return {
      ...map,
      cities: map.cities.map((c) =>
        c.id === "c" ? { ...c, infestation: 60 } : c,
      ),
    };
  }

  /** One day of `twoSources` under the given region conditions. */
  function withRegions(regions: SpreadRegionConditions, seed = 1) {
    return applySpread(
      twoSources(),
      0,
      {},
      {},
      rng(seed),
      { ...TUNING, hiveSpreadMultiplier: 1.5 },
      regions,
    );
  }

  /** Amount pushed by each source city, keyed by its id. */
  function pushedBy(
    events: readonly { type: string; payload: unknown }[],
  ): Record<string, number> {
    const pushed: Record<string, number> = {};
    for (const event of events) {
      if (event.type === INFESTATION_SPREAD) {
        const payload = event.payload as { fromCityId: string; amount: number };
        pushed[payload.fromCityId] = payload.amount;
      }
    }
    return pushed;
  }

  it("multiplies the push only from cities in a region that holds a hive", () => {
    const none = withRegions(NO_SPREAD_CONDITIONS);
    expect(pushedBy(none.events)).toEqual({ hot: 10, c: 10 });

    const east = withRegions({
      hiveRegions: new Set(["east"]),
      pausedRegions: new Set(),
    });
    expect(pushedBy(east.events)).toEqual({ hot: 10, c: 15 });
    expect(levels(east.state.map).far).toBe(15);

    const west = withRegions({
      hiveRegions: new Set(["west"]),
      pausedRegions: new Set(),
    });
    expect(pushedBy(west.events)).toEqual({ hot: 15, c: 10 });
  });

  it("judges the boost by the spreading city's region, not the receiving one's", () => {
    // a and b at 45 leave c (east, 30) as hot's least-infested neighbour,
    // so west's hot spreads across the border.
    const map = fixture();
    const across: EarthMap = {
      ...map,
      cities: map.cities.map((c) =>
        c.id === "a" || c.id === "b" ? { ...c, infestation: 45 } : c,
      ),
    };
    const dayWith = (hiveRegion: string) =>
      applySpread(
        across,
        0,
        {},
        {},
        rng(1),
        { ...TUNING, hiveSpreadMultiplier: 1.5 },
        { hiveRegions: new Set([hiveRegion]), pausedRegions: new Set() },
      );
    const fromWest = dayWith("west");
    expect(fromWest.events.map((e) => e.payload)).toEqual([
      { fromCityId: "hot", toCityId: "c", amount: 15 },
    ]);
    expect(dayWith("east").events.map((e) => e.payload)).toEqual([
      { fromCityId: "hot", toCityId: "c", amount: 10 },
    ]);
  });

  it("spreads nothing from a paused region and starts no cooldown there", () => {
    const paused = withRegions({
      hiveRegions: new Set(["west"]),
      pausedRegions: new Set(["west"]),
    });
    expect(pushedBy(paused.events)).toEqual({ c: 10 });
    expect(paused.state.cooldowns).toEqual({ c: 2 });
    expect(levels(paused.state.map)).toMatchObject({ a: 0, b: 0, hot: 70 });
  });

  it("is the same day with no conditions given as with NO_SPREAD_CONDITIONS", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const omitted = applySpread(twoSources(), 80, {}, {}, rng(seed), TUNING);
      const none = applySpread(
        twoSources(),
        80,
        {},
        {},
        rng(seed),
        TUNING,
        NO_SPREAD_CONDITIONS,
      );
      expect(none).toEqual(omitted);
    }
  });
});

// ===========================================
// Seeding
// ===========================================

describe("applySpread: seeding", () => {
  /** Seeded city ids over many seeds, for statistical assertions. */
  function seededCount(
    threat: number,
    deterrence: RegionDeterrence,
    seeds: number,
  ): number {
    let count = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const { events } = day(fixture(), threat, seed, {
        deterrence,
        tuning: { ...TUNING, spreadThreshold: 101 },
      });
      count += events.filter((e) => e.type === INFESTATION_SEEDED).length;
    }
    return count;
  }

  it("never seeds at zero threat", () => {
    expect(seededCount(0, {}, 50)).toBe(0);
  });

  it("seeds clean cities at the tuned level and only clean cities", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find(
      (s) =>
        day(fixture(), 100, s, {
          tuning: { ...TUNING, spreadThreshold: 101 },
        }).events.length > 0,
    );
    expect(seed).toBeDefined();
    const { state, events } = day(fixture(), 100, seed ?? 0, {
      tuning: { ...TUNING, spreadThreshold: 101 },
    });
    expect(seededEvents(events)).toHaveLength(events.length);
    for (const event of seededEvents(events)) {
      expect(["a", "b", "far"]).toContain(event.payload.cityId);
      expect(levels(state.map)[event.payload.cityId]).toBe(5);
    }
    expect(levels(state.map).hot).toBe(70);
    expect(levels(state.map).c).toBe(30);
  });

  it("seeds a city undetected: a fresh landing is hidden until detection finds it", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find(
      (s) =>
        day(fixture(), 100, s, {
          tuning: { ...TUNING, spreadThreshold: 101 },
        }).events.length > 0,
    );
    const { state, events } = day(fixture(), 100, seed ?? 0, {
      tuning: { ...TUNING, spreadThreshold: 101 },
    });
    expect(seededEvents(events).length).toBeGreaterThan(0);
    for (const event of seededEvents(events)) {
      const city = state.map.cities.find((c) => c.id === event.payload.cityId);
      expect(city?.infestation).toBeGreaterThan(0);
      expect(city?.detected).toBe(false);
    }
    // A city that was already infested and detected stays detected.
    expect(state.map.cities.find((c) => c.id === "hot")?.detected).toBe(true);
  });

  it("seeds more at higher threat", () => {
    const low = seededCount(20, {}, 60);
    const high = seededCount(100, {}, 60);
    expect(high).toBeGreaterThan(low);
  });

  it("is dampened by the region's deterrence and blocked at full deterrence", () => {
    const none = seededCount(100, {}, 60);
    const half = seededCount(100, { west: 0.5, east: 0.5 }, 60);
    const full = seededCount(100, { west: 1, east: 1 }, 60);
    expect(half).toBeLessThan(none);
    expect(full).toBe(0);
  });

  it("applies deterrence only to the named region", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { events } = day(fixture(), 100, seed, {
        deterrence: { west: 1 },
        tuning: { ...TUNING, spreadThreshold: 101 },
      });
      for (const event of events) {
        expect(event.payload).toEqual({ cityId: "far" });
      }
    }
  });

  it("does not seed a city that received spread the same day", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { events } = day(fixture(), 100, seed);
      const spreadTo = events
        .filter((e) => e.type === INFESTATION_SPREAD)
        .map((e) => e.payload.toCityId);
      const seeded = events
        .filter((e) => e.type === INFESTATION_SEEDED)
        .map((e) => e.payload.cityId);
      for (const id of seeded) {
        expect(spreadTo).not.toContain(id);
      }
    }
  });
});

// ===========================================
// Purity and validation
// ===========================================

describe("applySpread: purity and validation", () => {
  it("never mutates its inputs and shares unchanged objects", () => {
    const map = fixture();
    const cooldowns: SpreadCooldowns = { c: 3 };
    const beforeMap = snapshot(map);
    const beforeCooldowns = snapshot(cooldowns);
    const { state } = day(map, 0, 1, { cooldowns });
    expect(map).toEqual(beforeMap);
    expect(cooldowns).toEqual(beforeCooldowns);
    expect(state.map).not.toBe(map);
    expect(state.map.regions).toBe(map.regions);
    expect(state.cooldowns).not.toBe(cooldowns);
    const untouched = map.cities.find((c) => c.id === "far");
    expect(state.map.cities.find((c) => c.id === "far")).toBe(untouched);
  });

  it("returns JSON-serializable state", () => {
    const { state } = day(fixture(), 60, 3);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("works with the shipped defaults", () => {
    const { state, events } = day(fixture(), 0, 1, {
      tuning: INFESTATION_TUNING,
    });
    expect(events).toHaveLength(1);
    expect(state.cooldowns).toEqual({
      hot: INFESTATION_TUNING.spreadCooldownDays,
    });
  });

  it("rejects threat outside 0..100", () => {
    expect(() => day(fixture(), -1, 1)).toThrow(RangeError);
    expect(() => day(fixture(), 101, 1)).toThrow(RangeError);
    expect(() => day(fixture(), Number.NaN, 1)).toThrow(RangeError);
  });

  it("rejects deterrence outside 0..1 or for unknown regions", () => {
    expect(() => day(fixture(), 0, 1, { deterrence: { west: -0.1 } })).toThrow(
      RangeError,
    );
    expect(() => day(fixture(), 0, 1, { deterrence: { west: 1.5 } })).toThrow(
      RangeError,
    );
    expect(() => day(fixture(), 0, 1, { deterrence: { hot: 0.5 } })).toThrow(
      /unknown region "hot"/,
    );
  });

  it("rejects cooldowns for unknown cities or with bad day counts", () => {
    expect(() => day(fixture(), 0, 1, { cooldowns: { west: 2 } })).toThrow(
      /unknown city "west"/,
    );
    expect(() => day(fixture(), 0, 1, { cooldowns: { hot: 0 } })).toThrow(
      RangeError,
    );
    expect(() => day(fixture(), 0, 1, { cooldowns: { hot: 1.5 } })).toThrow(
      RangeError,
    );
  });
});
