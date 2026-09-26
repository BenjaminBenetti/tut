import { describe, expect, it } from "vitest";

import { DEPLOYABLE_TYPES } from "../data/deployable-types";
import { INFESTATION_TUNING } from "../data/infestation-tuning";
import { CITY_DETECTED } from "../model/city-detected-event";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import { buildEarthMap } from "./earth-map-builder";
import {
  applyDetection,
  detectionThresholds,
  isDetectable,
  witnessCity,
} from "./infestation-detection-service";

// ===========================================
// Fixtures
// ===========================================

/** Region mean 15, city 30: the shipped figures, pinned here. */
const TUNING: InfestationTuning = {
  ...INFESTATION_TUNING,
  regionDetectionThreshold: 15,
  cityDetectionThreshold: 30,
};

/**
 * West: three cities, one clean and two quietly infested (mean 8, under
 * the region threshold; both under the city threshold).
 * East: one loud city already detected and one quiet one (mean 14,
 * also under the region threshold; the quiet one under the city's).
 *
 *   west: clean=0  low=10  mid=14      east: loud=20✓  quiet=8
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
            id: "low",
            name: "Low",
            layout: { x: 0.2, y: 0.1 },
            infestation: 10,
            detected: false,
          },
          {
            id: "mid",
            name: "Mid",
            layout: { x: 0.3, y: 0.1 },
            infestation: 14,
            detected: false,
          },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          {
            id: "loud",
            name: "Loud",
            layout: { x: 0.8, y: 0.1 },
            infestation: 20,
            detected: true,
          },
          {
            id: "quiet",
            name: "Quiet",
            layout: { x: 0.9, y: 0.1 },
            infestation: 8,
            detected: false,
          },
        ],
      },
    ],
    links: [
      ["clean", "low"],
      ["low", "mid"],
      ["mid", "loud"],
      ["loud", "quiet"],
    ],
  });
}

/** Detection by city id, for terse assertions. */
function detected(map: EarthMap): Record<string, boolean> {
  return Object.fromEntries(map.cities.map((c) => [c.id, c.detected]));
}

/** The fixture with one city's infestation replaced. */
function withCity(
  map: EarthMap,
  id: string,
  patch: { infestation?: number; detected?: boolean },
): EarthMap {
  return {
    ...map,
    cities: map.cities.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

// ===========================================
// Formulae
// ===========================================

describe("detectionThresholds", () => {
  it("scales both tuning thresholds by the sensor factor", () => {
    expect(detectionThresholds(1, TUNING)).toEqual({ region: 15, city: 30 });
    expect(detectionThresholds(0.5, TUNING)).toEqual({ region: 7.5, city: 15 });
  });

  it("drops with every sensor level", () => {
    const sensor = DEPLOYABLE_TYPES["sensor-array"];
    const at = (level: 1 | 2 | 3) =>
      detectionThresholds(
        sensor.levels[level].effect.detectionFactor ?? 1,
        TUNING,
      );
    expect(at(2).city).toBeLessThan(at(1).city);
    expect(at(3).city).toBeLessThan(at(2).city);
    expect(at(3).region).toBeLessThan(at(1).region);
  });
});

describe("isDetectable", () => {
  const thresholds = { region: 15, city: 30 };

  it("finds a city when either signal reaches its threshold", () => {
    expect(isDetectable(30, 0, thresholds)).toBe(true);
    expect(isDetectable(1, 15, thresholds)).toBe(true);
    expect(isDetectable(29, 14.9, thresholds)).toBe(false);
  });
});

// ===========================================
// Tick step
// ===========================================

describe("applyDetection", () => {
  it("leaves quiet cities hidden below both thresholds and returns the same map", () => {
    const map = fixture();
    const { state, events } = applyDetection(map, {}, TUNING);
    expect(state).toBe(map);
    expect(events).toEqual([]);
    expect(detected(state)).toEqual({
      clean: false,
      low: false,
      mid: false,
      loud: true,
      quiet: false,
    });
  });

  it("finds a city on its own once it reaches the city threshold", () => {
    const map = withCity(fixture(), "low", { infestation: 30 });
    const { state, events } = applyDetection(map, {}, TUNING);
    expect(detected(state).low).toBe(true);
    expect(detected(state).mid).toBe(false);
    expect(events).toEqual([
      {
        type: CITY_DETECTED,
        payload: { cityId: "low", regionId: "west", infestation: 30 },
      },
    ]);
  });

  it("finds every infested city in a region once the region's mean reaches its threshold", () => {
    // West mean = (0 + 31 + 14) / 3 = 15: the low city is found by the region, not itself.
    const map = withCity(fixture(), "low", { infestation: 31 });
    const { state, events } = applyDetection(map, {}, TUNING);
    expect(detected(state)).toMatchObject({
      low: true,
      mid: true,
      clean: false,
    });
    expect(events.map((e) => e.payload.cityId)).toEqual(["low", "mid"]);
  });

  it("counts the region's already-detected cities in the mean: East's loud city reveals its quiet one", () => {
    // East mean = (50 + 8) / 2 = 29 ≥ 15, though the quiet city is only at 8.
    const map = withCity(fixture(), "loud", { infestation: 50 });
    const { state, events } = applyDetection(map, {}, TUNING);
    expect(detected(state).quiet).toBe(true);
    expect(events.map((e) => e.payload.cityId)).toEqual(["quiet"]);
  });

  it("lowers a region's thresholds by its sensor factor, and only that region's", () => {
    // West mean 8: a factor of 0.5 makes the region threshold 7.5.
    const { state, events } = applyDetection(fixture(), { west: 0.5 }, TUNING);
    expect(detected(state)).toMatchObject({ low: true, mid: true });
    expect(events.map((e) => e.payload.cityId)).toContain("low");
    const { state: other } = applyDetection(
      withCity(fixture(), "quiet", { infestation: 0 }),
      { west: 0.9 },
      TUNING,
    );
    expect(detected(other)).toMatchObject({ low: false, mid: false });
  });

  it("finds a fresh landing sooner at sensor level 3 than at level 1", () => {
    const sensor = DEPLOYABLE_TYPES["sensor-array"];
    const factor = (level: 1 | 3) =>
      sensor.levels[level].effect.detectionFactor ?? 1;
    const map = withCity(fixture(), "low", { infestation: 8 });
    expect(
      detected(applyDetection(map, { west: factor(1) }, TUNING).state).low,
    ).toBe(false);
    expect(
      detected(applyDetection(map, { west: factor(3) }, TUNING).state).low,
    ).toBe(true);
  });

  it("quietly forgets a detected city that has been cleared to zero", () => {
    const map = withCity(fixture(), "loud", { infestation: 0, detected: true });
    const { state, events } = applyDetection(map, {}, TUNING);
    expect(detected(state).loud).toBe(false);
    expect(events.map((e) => e.payload.cityId)).not.toContain("loud");
  });

  it("never mutates the input and shares unchanged cities", () => {
    const map = withCity(fixture(), "low", { infestation: 30 });
    const before = JSON.parse(JSON.stringify(map)) as EarthMap;
    const { state } = applyDetection(map, {}, TUNING);
    expect(map).toEqual(before);
    expect(state.regions).toBe(map.regions);
    expect(state.cities[0]).toBe(map.cities[0]);
    expect(state.cities[1]).not.toBe(map.cities[1]);
  });

  it("rejects factors outside (0, 1] or for unknown regions", () => {
    for (const bad of [0, -0.5, 1.5, Number.NaN]) {
      expect(() => applyDetection(fixture(), { west: bad }, TUNING)).toThrow(
        RangeError,
      );
    }
    expect(() => applyDetection(fixture(), { mars: 0.5 }, TUNING)).toThrow(
      /unknown region "mars"/,
    );
  });
});

// ===========================================
// witnessCity
// ===========================================

describe("witnessCity", () => {
  it("finds a quietly infested city whatever the thresholds say, and announces it", () => {
    const map = fixture();
    const { state, events } = witnessCity(map, "low");
    expect(state.cities.find((city) => city.id === "low")?.detected).toBe(true);
    expect(events).toEqual([
      {
        type: CITY_DETECTED,
        payload: { cityId: "low", regionId: "west", infestation: 10 },
      },
    ]);
    expect(map.cities.find((city) => city.id === "low")?.detected).toBe(false);
  });

  it("leaves a clean city, a detected one and an unknown one alone", () => {
    const map = fixture();
    for (const cityId of ["clean", "loud", "nowhere"]) {
      expect(witnessCity(map, cityId), cityId).toEqual({
        state: map,
        events: [],
      });
    }
  });
});
