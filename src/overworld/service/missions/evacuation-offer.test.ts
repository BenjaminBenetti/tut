import { describe, expect, it } from "vitest";

import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { City } from "../../model/city";
import type { EarthMap } from "../../model/earth-map";
import { getCity } from "../earth-map-query-service";
import {
  EVACUATION_OFFER,
  evacuationGroups,
  evacuationSiteWeight,
} from "./evacuation-offer";
import {
  boardMap,
  fixtureState,
  missionAt,
  offerContext,
} from "./mission-fixtures.test-helper";
import { buildOffer } from "./mission-offer-builder";
import { MISSION_OFFER_RULES } from "./mission-offer-rules";

// ===========================================
// Fixtures
// ===========================================

const TUNING = MISSION_TUNING.evacuation;

/** `map` with each listed city's population set. */
function withPopulations(
  map: EarthMap,
  populations: Readonly<Record<string, number>>,
): EarthMap {
  return {
    ...map,
    cities: map.cities.map((city) =>
      city.id in populations
        ? { ...city, population: populations[city.id] ?? city.population }
        : city,
    ),
  };
}

/** `map` with `cityId` undetected. */
function withHiddenCity(map: EarthMap, cityId: string): EarthMap {
  return {
    ...map,
    cities: map.cities.map((city) =>
      city.id === cityId ? { ...city, detected: false } : city,
    ),
  };
}

/** A city of `population`, for the weight alone. */
function cityOf(population: number): City {
  return { ...getCity(boardMap([30]), "c0"), population };
}

// ===========================================
// Tests
// ===========================================

describe("EVACUATION_OFFER (arc §6.4)", () => {
  it("is the evacuation's entry, drawn by the director from Act I's third mission", () => {
    expect(MISSION_OFFER_RULES.evacuation).toBe(EVACUATION_OFFER);
    expect(EVACUATION_OFFER.kind).toBe("offer");
    expect(EVACUATION_OFFER.typeId).toBe("evacuation");
    expect(EVACUATION_OFFER.debut).toEqual({
      act: "act-1",
      missionsInAct: 2,
    });
  });

  it("is eligible at a detected city at 25 infestation or more, and nowhere under", () => {
    // c0..c4 at 0, 10, 24, 25, 90: c0 is clean and so undetected.
    const sites = EVACUATION_OFFER.eligible(
      fixtureState({ map: boardMap([0, 10, 24, 25, 90]) }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["c3", "c4"]);
    expect(TUNING.minInfestation).toBe(25);
  });

  it("skips a city the player has not detected, however infested (GDD §5.3)", () => {
    const map = withHiddenCity(boardMap([50, 60, 70]), "c1");
    const sites = EVACUATION_OFFER.eligible(
      fixtureState({ map }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["c0", "c2"]);
  });

  it("skips a city that already holds an offer", () => {
    const sites = EVACUATION_OFFER.eligible(
      fixtureState({
        map: boardMap([50, 60, 70]),
        missions: [missionAt("c2", 20)],
      }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["c0", "c1"]);
  });

  it("weights bigger cities higher, on a log scale", () => {
    const map = withPopulations(boardMap([30, 30, 30, 30]), {
      c0: 80_000,
      c1: 1_000_000,
      c2: 10_000_000,
      c3: 37_000_000,
    });
    const sites = EVACUATION_OFFER.eligible(
      fixtureState({ map }),
      offerContext(1, ACTS["act-1"]),
    );
    expect(sites.map((site) => site.cityId)).toEqual(["c0", "c1", "c2", "c3"]);
    const weights = sites.map((site) => site.weight);
    expect(weights[0]).toBe(1);
    expect(weights[1]).toBeCloseTo(2, 9);
    expect(weights[2]).toBeCloseTo(3, 9);
    expect(weights[3]).toBeCloseTo(3.568, 3);
  });

  it("creates the ordinary offer at the site's city, carrying its groups", () => {
    const state = fixtureState({ map: boardMap([30, 60]) });
    const site = { cityId: "c1", weight: 2 };
    const created = EVACUATION_OFFER.create(
      state,
      site,
      offerContext(4, ACTS["act-2"]),
    );
    const ordinary = buildOffer(
      state,
      getCity(state.map, "c1"),
      "evacuation",
      offerContext(4, ACTS["act-2"]),
    );
    expect(created).toEqual({
      ...ordinary,
      evacuation: {
        groups: evacuationGroups(ordinary.difficulty, TUNING),
        creditsPerGroup: 100,
      },
    });
    expect(created.typeId).toBe("evacuation");
    expect(created.ignorePenalty).toBe(0);
  });
});

describe("evacuationSiteWeight", () => {
  it("weighs a town under the unit as 1, never less", () => {
    expect(evacuationSiteWeight(cityOf(0), TUNING)).toBe(1);
    expect(evacuationSiteWeight(cityOf(99_999), TUNING)).toBe(1);
    expect(evacuationSiteWeight(cityOf(100_000), TUNING)).toBe(1);
  });
});

describe("evacuationGroups", () => {
  it("traps 3 groups at d1–3, 4 at d4–6 and 5 from d7", () => {
    expect(
      Array.from({ length: 10 }, (_, i) => evacuationGroups(i + 1, TUNING)),
    ).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5, 5]);
  });

  it("never leaves the 3–5 range, whatever the difficulty", () => {
    expect(evacuationGroups(0, TUNING)).toBe(3);
    expect(evacuationGroups(40, TUNING)).toBe(5);
  });
});
