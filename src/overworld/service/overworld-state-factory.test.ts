import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { THREAT_TUNING } from "../data/threat-tuning";
import type { EarthMap } from "../model/earth-map";
import type { CitySeed } from "../model/earth-map-spec";
import type { NewGameTuning } from "../model/new-game-tuning";
import type { OverworldState } from "../model/overworld-state";
import { FIRST_DAY } from "../model/overworld-state";
import { buildEarthMap } from "./earth-map-builder";
import { createInitialOverworldState } from "./overworld-state-factory";
import { computeThreat } from "./threat-service";

/** A city with a throwaway layout. */
function city(id: string): CitySeed {
  return { id, name: id.toUpperCase(), layout: { x: 0.5, y: 0.5 } };
}

const MAP: EarthMap = buildEarthMap({
  regions: [
    {
      id: "r1",
      name: "R1",
      biome: "temperate",
      cities: [city("a"), city("b"), city("c")],
    },
    { id: "r2", name: "R2", biome: "coastal", cities: [city("d")] },
  ],
  links: [
    ["a", "b"],
    ["b", "c"],
    ["c", "d"],
  ],
});

const TUNING: NewGameTuning = {
  infestedCities: { min: 2, max: 3 },
  initialInfestation: { min: 10, max: 30 },
};

/** Builds a state from a seed with the default fixtures. */
function build(seed: number, tuning: NewGameTuning = TUNING): OverworldState {
  return createInitialOverworldState(MAP, {
    rng: new Mulberry32Rng(seed),
    tuning,
    threatTuning: THREAT_TUNING,
  });
}

describe("createInitialOverworldState", () => {
  it("starts on the first day with nothing else happening", () => {
    const state = build(1);
    expect(state.day).toBe(FIRST_DAY);
    expect(state.missions).toEqual([]);
    expect(state.spreadCooldowns).toEqual({});
    expect(state.pendingEvents).toEqual([]);
    expect(state.deployables).toEqual([]);
    expect(state.hives).toEqual([]);
    expect(state.outcome).toBeUndefined();
    expect(state.lastMissionResult).toBeUndefined();
  });

  it("infests a tuned number of distinct cities within the tuned range", () => {
    const state = build(7);
    const infested = state.map.cities.filter((c) => c.infestation > 0);
    expect(infested.length).toBeGreaterThanOrEqual(TUNING.infestedCities.min);
    expect(infested.length).toBeLessThanOrEqual(TUNING.infestedCities.max);
    for (const c of infested) {
      expect(c.infestation).toBeGreaterThanOrEqual(
        TUNING.initialInfestation.min,
      );
      expect(c.infestation).toBeLessThanOrEqual(TUNING.initialInfestation.max);
      expect(Number.isInteger(c.infestation)).toBe(true);
    }
    expect(state.map.regions).toBe(MAP.regions);
    expect(state.map.cities.map((c) => c.id)).toEqual(
      MAP.cities.map((c) => c.id),
    );
  });

  it("stores the threat the seeded map implies", () => {
    const state = build(3);
    expect(state.threat).toBe(
      computeThreat(state.map, FIRST_DAY, THREAT_TUNING),
    );
    expect(state.threat).toBeGreaterThan(0);
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(build(11)).toEqual(build(11));
    expect(build(11).map).not.toEqual(build(12).map);
  });

  it("does not mutate the input map", () => {
    const before = JSON.parse(JSON.stringify(MAP)) as EarthMap;
    build(5);
    expect(MAP).toEqual(before);
  });

  it("honours degenerate ranges: every city, or none", () => {
    const all = build(1, {
      infestedCities: { min: MAP.cities.length, max: MAP.cities.length },
      initialInfestation: { min: 20, max: 20 },
    });
    expect(all.map.cities.every((c) => c.infestation === 20)).toBe(true);

    const none = build(1, { ...TUNING, infestedCities: { min: 0, max: 0 } });
    expect(none.map.cities.every((c) => c.infestation === 0)).toBe(true);
    expect(none.threat).toBe(computeThreat(MAP, FIRST_DAY, THREAT_TUNING));
  });

  it("rejects tuning ranges that are inverted, fractional or out of bounds", () => {
    const bad: NewGameTuning[] = [
      { ...TUNING, infestedCities: { min: 3, max: 2 } },
      { ...TUNING, infestedCities: { min: 1, max: MAP.cities.length + 1 } },
      { ...TUNING, infestedCities: { min: 0.5, max: 2 } },
      { ...TUNING, initialInfestation: { min: 10, max: 101 } },
      { ...TUNING, initialInfestation: { min: -1, max: 10 } },
    ];
    for (const tuning of bad) {
      expect(() => build(1, tuning)).toThrow(RangeError);
    }
  });
});
