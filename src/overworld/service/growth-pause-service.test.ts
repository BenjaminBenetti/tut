import { describe, expect, it } from "vitest";

import type { EarthMap } from "../model/earth-map";
import { buildEarthMap } from "./earth-map-builder";
import {
  pausedRegions,
  pauseRegionGrowth,
  withPausedGrowth,
} from "./growth-pause-service";
import { fixtureState } from "./missions/mission-fixtures.test-helper";

/** Two regions of two cities each. */
function fixture(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "w1", name: "W1", layout: { x: 0.1, y: 0.1 }, infestation: 40 },
          { id: "w2", name: "W2", layout: { x: 0.2, y: 0.1 }, infestation: 50 },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          { id: "e1", name: "E1", layout: { x: 0.8, y: 0.1 }, infestation: 30 },
          { id: "e2", name: "E2", layout: { x: 0.9, y: 0.1 } },
        ],
      },
    ],
    links: [
      ["w1", "w2"],
      ["w2", "e1"],
      ["e1", "e2"],
    ],
  });
}

describe("pausedRegions", () => {
  it("is empty with no pauses recorded", () => {
    expect(pausedRegions({}, 5).size).toBe(0);
  });

  it("holds a region on every day before the day it resumes, and not after", () => {
    const overworld = { growthPausedUntil: { west: 31, east: 12 } };
    expect([...pausedRegions(overworld, 21)]).toEqual(["west"]);
    expect([...pausedRegions(overworld, 30)]).toEqual(["west"]);
    expect([...pausedRegions(overworld, 31)]).toEqual([]);
    expect([...pausedRegions(overworld, 11)]).toEqual(["west", "east"]);
  });
});

describe("withPausedGrowth", () => {
  it("returns the factors themselves when nothing is paused", () => {
    const factors = { w1: 0.5 };
    expect(withPausedGrowth(fixture(), factors, new Set())).toBe(factors);
  });

  it("holds every city of a paused region at 0 and leaves the rest alone", () => {
    const factors = { w1: 0.5, e1: 0.25 };
    expect(withPausedGrowth(fixture(), factors, new Set(["west"]))).toEqual({
      w1: 0,
      w2: 0,
      e1: 0.25,
    });
    expect(factors).toEqual({ w1: 0.5, e1: 0.25 });
  });
});

describe("pauseRegionGrowth", () => {
  it("holds a region for `days` ticks from the day after", () => {
    const paused = pauseRegionGrowth(fixtureState(), "east", 20, 5);
    expect(paused.growthPausedUntil).toEqual({ east: 26 });
    expect([...pausedRegions(paused, 21)]).toEqual(["east"]);
    expect([...pausedRegions(paused, 25)]).toEqual(["east"]);
    expect([...pausedRegions(paused, 26)]).toEqual([]);
  });

  it("keeps a longer pause and other regions' pauses, and extends a shorter one", () => {
    const state = fixtureState({ growthPausedUntil: { east: 40, west: 22 } });
    expect(pauseRegionGrowth(state, "east", 20, 5)).toBe(state);
    expect(pauseRegionGrowth(state, "west", 20, 5).growthPausedUntil).toEqual({
      east: 40,
      west: 26,
    });
    expect(pauseRegionGrowth(state, "west", 20, 0)).toBe(state);
  });
});
