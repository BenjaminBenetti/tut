import { describe, expect, it } from "vitest";

import { INFESTATION_TUNING } from "../data/infestation-tuning";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import { CITY_INFESTATION_CHANGED } from "../model/overworld-domain-event";
import { buildEarthMap } from "./earth-map-builder";
import { applyGrowth, growthDelta } from "./infestation-growth-service";

// ===========================================
// Fixtures
// ===========================================

/** Base growth 4, doubling at maximum threat. */
const TUNING: InfestationTuning = { baseGrowthRate: 4, threatFactor: 1 };

/**
 * Four cities: one dormant, one fresh, one near the cap, one overrun.
 *
 *   clean=0   fresh=10   high=98   full=100
 */
function fixture(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "clean", name: "Clean", layout: { x: 0.1, y: 0.1 } },
          {
            id: "fresh",
            name: "Fresh",
            layout: { x: 0.2, y: 0.1 },
            infestation: 10,
          },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          {
            id: "high",
            name: "High",
            layout: { x: 0.8, y: 0.1 },
            infestation: 98,
          },
          {
            id: "full",
            name: "Full",
            layout: { x: 0.9, y: 0.1 },
            infestation: 100,
          },
        ],
      },
    ],
    links: [
      ["clean", "fresh"],
      ["fresh", "high"],
      ["high", "full"],
    ],
  });
}

/** Infestation by city id, for terse assertions. */
function levels(map: EarthMap): Record<string, number> {
  return Object.fromEntries(map.cities.map((c) => [c.id, c.infestation]));
}

/** Deep snapshot to prove the input map was not mutated. */
function snapshot(map: EarthMap): EarthMap {
  return JSON.parse(JSON.stringify(map)) as EarthMap;
}

// ===========================================
// Formula
// ===========================================

describe("growthDelta", () => {
  it("is the base rate at zero threat and scales linearly with threat", () => {
    expect(growthDelta(0, 0, TUNING)).toBe(4);
    expect(growthDelta(50, 0, TUNING)).toBe(6);
    expect(growthDelta(100, 0, TUNING)).toBe(8);
  });

  it("ignores threat when the threat factor is zero", () => {
    const flat: InfestationTuning = { baseGrowthRate: 4, threatFactor: 0 };
    expect(growthDelta(100, 0, flat)).toBe(4);
  });

  it("subtracts suppression and can go negative", () => {
    expect(growthDelta(0, 1, TUNING)).toBe(3);
    expect(growthDelta(0, 4, TUNING)).toBe(0);
    expect(growthDelta(0, 10, TUNING)).toBe(-6);
  });
});

// ===========================================
// Tick step
// ===========================================

describe("applyGrowth", () => {
  it("grows every infested city by the base rate at zero threat", () => {
    const { state, events } = applyGrowth(fixture(), 0, {}, TUNING);
    expect(levels(state)).toEqual({
      clean: 0,
      fresh: 14,
      high: 100,
      full: 100,
    });
    expect(events.map((e) => e.payload)).toEqual([
      { cityId: "fresh", from: 10, to: 14 },
      { cityId: "high", from: 98, to: 100 },
    ]);
    for (const event of events) {
      expect(event.type).toBe(CITY_INFESTATION_CHANGED);
    }
  });

  it("clamps at 100 and emits nothing for a city already there", () => {
    const { state, events } = applyGrowth(fixture(), 100, {}, TUNING);
    expect(levels(state).high).toBe(100);
    expect(levels(state).full).toBe(100);
    expect(events.map((e) => e.payload.cityId)).not.toContain("full");
  });

  it("scales growth with threat", () => {
    const at0 = applyGrowth(fixture(), 0, {}, TUNING);
    const at50 = applyGrowth(fixture(), 50, {}, TUNING);
    const at100 = applyGrowth(fixture(), 100, {}, TUNING);
    expect(levels(at0.state).fresh).toBe(14);
    expect(levels(at50.state).fresh).toBe(16);
    expect(levels(at100.state).fresh).toBe(18);
  });

  it("reduces growth by suppression, per city, and can push a city down", () => {
    const partial = applyGrowth(fixture(), 0, { fresh: 3 }, TUNING);
    expect(levels(partial.state).fresh).toBe(11);
    expect(levels(partial.state).high).toBe(100);

    const cancelled = applyGrowth(fixture(), 0, { fresh: 4 }, TUNING);
    expect(levels(cancelled.state).fresh).toBe(10);
    expect(cancelled.events.map((e) => e.payload.cityId)).toEqual(["high"]);

    const reversed = applyGrowth(fixture(), 0, { fresh: 10, full: 50 }, TUNING);
    expect(levels(reversed.state).fresh).toBe(4);
    expect(levels(reversed.state).full).toBe(54);
    expect(reversed.events.map((e) => e.payload)).toEqual([
      { cityId: "fresh", from: 10, to: 4 },
      { cityId: "high", from: 98, to: 100 },
      { cityId: "full", from: 100, to: 54 },
    ]);
  });

  it("clamps at zero when suppression overwhelms a city", () => {
    const { state, events } = applyGrowth(fixture(), 0, { fresh: 99 }, TUNING);
    expect(levels(state).fresh).toBe(0);
    expect(events[0]?.payload).toEqual({ cityId: "fresh", from: 10, to: 0 });
  });

  it("leaves dormant cities at zero regardless of threat", () => {
    const map = fixture();
    const { state, events } = applyGrowth(map, 100, {}, TUNING);
    expect(levels(state).clean).toBe(0);
    expect(events.map((e) => e.payload.cityId)).not.toContain("clean");
    expect(state.cities[0]).toBe(map.cities[0]);
  });

  it("rounds fractional growth to keep infestation an integer", () => {
    const half: InfestationTuning = { baseGrowthRate: 2.5, threatFactor: 0 };
    const { state } = applyGrowth(fixture(), 0, {}, half);
    expect(levels(state).fresh).toBe(13);
    for (const city of state.cities) {
      expect(Number.isInteger(city.infestation), city.id).toBe(true);
    }
  });

  it("emits no events when nothing changes", () => {
    const { events } = applyGrowth(fixture(), 0, { fresh: 4, high: 4 }, TUNING);
    expect(events).toEqual([]);
  });

  it("never mutates the input and shares unchanged objects", () => {
    const map = fixture();
    const before = snapshot(map);
    const { state } = applyGrowth(map, 0, {}, TUNING);
    expect(map).toEqual(before);
    expect(state).not.toBe(map);
    expect(state.cities).not.toBe(map.cities);
    expect(state.regions).toBe(map.regions);
    expect(state.cities[3]).toBe(map.cities[3]);
    expect(state.cities[1]).not.toBe(map.cities[1]);
  });

  it("returns JSON-serializable state", () => {
    const { state } = applyGrowth(fixture(), 30, { fresh: 1 }, TUNING);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("works with the shipped defaults", () => {
    const { state } = applyGrowth(fixture(), 0, {}, INFESTATION_TUNING);
    expect(levels(state).fresh).toBe(10 + INFESTATION_TUNING.baseGrowthRate);
  });

  it("rejects threat outside 0..100", () => {
    expect(() => applyGrowth(fixture(), -1, {}, TUNING)).toThrow(RangeError);
    expect(() => applyGrowth(fixture(), 101, {}, TUNING)).toThrow(RangeError);
    expect(() => applyGrowth(fixture(), Number.NaN, {}, TUNING)).toThrow(
      RangeError,
    );
  });

  it("rejects negative, non-finite or misaddressed suppression", () => {
    expect(() => applyGrowth(fixture(), 0, { fresh: -1 }, TUNING)).toThrow(
      RangeError,
    );
    expect(() =>
      applyGrowth(fixture(), 0, { fresh: Number.NaN }, TUNING),
    ).toThrow(RangeError);
    expect(() => applyGrowth(fixture(), 0, { west: 2 }, TUNING)).toThrow(
      /unknown city "west"/,
    );
  });
});
