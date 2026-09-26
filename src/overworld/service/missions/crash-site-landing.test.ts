import { describe, expect, it } from "vitest";

import { MISSION_TUNING } from "../../data/mission-tuning";
import { CITY_DETECTED } from "../../model/city-detected-event";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { Mission } from "../../model/mission";
import { getCity } from "../earth-map-query-service";
import {
  asCrashSiteOffer,
  crashSiteSites,
  landCrashSite,
  landedCity,
} from "./crash-site-landing";
import {
  fixtureState,
  installation,
  missionAt,
  progressIn,
} from "./mission-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const TUNING = MISSION_TUNING.crashSite;

/** A crash-site offer at `cityId` recording a landing on a city that held `pre`. */
function crashAt(cityId: string, pre: number): Mission {
  return {
    ...missionAt(cityId, 20, 15, "crash-site"),
    crashSite: { landingCityId: cityId, preLandingInfestation: pre },
  };
}

// ===========================================
// crashSiteSites
// ===========================================

describe("crashSiteSites", () => {
  it("offers every city of a region with a detected city, clean ones included (arc §6.3)", () => {
    // west: clean (0, unseen) and low (10, seen); east: mid 50, full 100.
    const sites = crashSiteSites(fixtureState(), TUNING);
    expect(sites.map((site) => site.cityId)).toEqual([
      "clean",
      "low",
      "mid",
      "full",
    ]);
  });

  it("offers nothing in a region where nothing is detected", () => {
    const state = fixtureState();
    const hidden = {
      ...state,
      map: {
        ...state.map,
        cities: state.map.cities.map((city) =>
          city.regionId === "west" ? { ...city, detected: false } : city,
        ),
      },
    };
    expect(crashSiteSites(hidden, TUNING).map((site) => site.cityId)).toEqual([
      "mid",
      "full",
    ]);
  });

  it("weighs a clean or low city four times a city deep in it", () => {
    expect(crashSiteSites(fixtureState(), TUNING)).toEqual([
      { cityId: "clean", weight: 4 },
      { cityId: "low", weight: 4 },
      { cityId: "mid", weight: 1 },
      { cityId: "full", weight: 1 },
    ]);
  });

  it("skips a city that already holds an offer", () => {
    const sites = crashSiteSites(
      fixtureState({ missions: [missionAt("low", 20)] }),
      TUNING,
    );
    expect(sites.map((site) => site.cityId)).toEqual(["clean", "mid", "full"]);
  });

  it("doubles a region with an online sensor array, from Act II only", () => {
    const array = installation("array", "east", "sensor-array");
    const weights = (act: "act-1" | "act-2" | "act-3", online = true) =>
      crashSiteSites(
        fixtureState({
          progress: progressIn(act),
          deployables: [{ ...array, online }],
        }),
        TUNING,
      ).map((site) => site.weight);
    expect(weights("act-1")).toEqual([4, 4, 1, 1]);
    expect(weights("act-2")).toEqual([4, 4, 2, 2]);
    expect(weights("act-3")).toEqual([4, 4, 2, 2]);
    expect(weights("act-2", false)).toEqual([4, 4, 1, 1]);
  });

  it("does not count another installation as a sensor array", () => {
    const sites = crashSiteSites(
      fixtureState({
        progress: progressIn("act-2"),
        deployables: [installation("battery", "east", "defensive-battery")],
      }),
      TUNING,
    );
    expect(sites.map((site) => site.weight)).toEqual([4, 4, 1, 1]);
  });
});

// ===========================================
// The offer
// ===========================================

describe("landedCity and asCrashSiteOffer", () => {
  it("builds on the city as the landing leaves it, clamped", () => {
    const map = fixtureState().map;
    expect(landedCity(getCity(map, "clean"), TUNING).infestation).toBe(10);
    expect(landedCity(getCity(map, "full"), TUNING).infestation).toBe(100);
  });

  it("records the landing on the city as it was, and pays tech points ×1.5", () => {
    const city = getCity(fixtureState().map, "low");
    const offer = {
      ...missionAt("low", 20),
      rewards: { credits: 900, techPoints: 17 },
    };
    const crash = asCrashSiteOffer(offer, city, TUNING);
    expect(crash.crashSite).toEqual({
      landingCityId: "low",
      preLandingInfestation: 10,
    });
    expect(crash.rewards).toEqual({ credits: 900, techPoints: 26 });
  });
});

// ===========================================
// landCrashSite
// ===========================================

describe("landCrashSite", () => {
  it("seeds 10 at a clean city through the events, and the player sees it land", () => {
    const state = fixtureState();
    const landed = landCrashSite(state, crashAt("clean", 0), TUNING);
    const city = getCity(landed.state.map, "clean");
    expect(city.infestation).toBe(10);
    expect(city.detected).toBe(true);
    expect(landed.events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "clean", from: 0, to: 10 },
      },
      {
        type: CITY_DETECTED,
        payload: { cityId: "clean", regionId: "west", infestation: 10 },
      },
    ]);
    expect(getCity(state.map, "clean").infestation).toBe(0);
  });

  it("adds 10 to a city already seen, with no second detection", () => {
    const landed = landCrashSite(fixtureState(), crashAt("mid", 50), TUNING);
    expect(getCity(landed.state.map, "mid").infestation).toBe(60);
    expect(landed.events).toEqual([
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: "mid", from: 50, to: 60 },
      },
    ]);
  });

  it("lands nothing for an offer without a landing spec", () => {
    const state = fixtureState();
    const landed = landCrashSite(
      state,
      missionAt("clean", 20, 15, "crash-site"),
      TUNING,
    );
    expect(landed).toEqual({ state, events: [] });
  });
});
