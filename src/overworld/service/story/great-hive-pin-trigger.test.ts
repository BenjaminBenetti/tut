import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { CONTINENTS } from "../../data/continents";
import { EARTH_MAP } from "../../data/earth-map";
import { GREAT_HIVE_TUNING } from "../../data/great-hive-tuning";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { withInfestation } from "../../model/city";
import type { GreatHive } from "../../model/great-hive";
import type { Mission } from "../../model/mission";
import { MISSION_WITHDRAWN } from "../../model/mission-withdrawn-event";
import type { OverworldState } from "../../model/overworld-state";
import { citiesInRegion } from "../earth-map-query-service";
import { revealGreatHives } from "../great-hive-service";
import {
  countsAgainstCap,
  generateMissions,
} from "../mission-generation-service";
import { hiveAssaultTechPoints } from "../missions/hive-assault-trigger";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import {
  GREAT_HIVE_PIN_TRIGGER,
  GREAT_HIVE_STORY_ID,
  greatHiveTechPoints,
} from "./great-hive-pin-trigger";
import { pinContext } from "./story-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/** Act III on the Earth map, every city detected at 30, with the Great Hives revealed on `seed`. */
function revealed(seed = 1): OverworldState {
  const state = fixtureState({
    day: 200,
    map: {
      ...EARTH_MAP,
      cities: EARTH_MAP.cities.map((city) => ({
        ...withInfestation(city, 30),
        detected: true,
      })),
    },
    progress: { ...progressIn("act-3", 0), flags: ["uplink-won"] },
  });
  return revealGreatHives(
    state,
    state.day,
    new Mulberry32Rng(seed),
    new SequentialIdGenerator(),
    { continents: CONTINENTS, tuning: GREAT_HIVE_TUNING },
  ).state;
}

/** The Great Hives of `state`. */
function greatHivesOf(state: OverworldState): readonly GreatHive[] {
  return state.greatHives ?? [];
}

/** `state` with the Great Hive `id` changed by `change`. */
function withGreatHive(
  state: OverworldState,
  id: string,
  change: Partial<GreatHive>,
): OverworldState {
  return {
    ...state,
    greatHives: greatHivesOf(state).map((hive) =>
      hive.id === id ? { ...hive, ...change } : hive,
    ),
  };
}

/** The Great Hive assaults `GREAT_HIVE_PIN_TRIGGER` pins on `state`. */
function pin(state: OverworldState, seed = 1): readonly Mission[] {
  return GREAT_HIVE_PIN_TRIGGER.pin(state, pinContext(seed, ACTS["act-3"]));
}

/** The shipped director's day on `state` with only the Great Hive pins. */
function direct(state: OverworldState, seed = 1) {
  return generateMissions(state, {
    intelBonus: {},
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    offerRules: MISSION_OFFER_RULES,
    consequences: MISSION_CONSEQUENCE_RULES,
    acts: ACTS,
    decorators: [],
    pinTriggers: [GREAT_HIVE_PIN_TRIGGER],
    hiveTuning: HIVE_TUNING,
  });
}

/** Great Hive offers on the board of `state`. */
function greatOffers(state: OverworldState): Mission[] {
  return state.missions.filter((m) => m.storyId === GREAT_HIVE_STORY_ID);
}

// ===========================================
// The trigger
// ===========================================

describe("GREAT_HIVE_PIN_TRIGGER", () => {
  it("pins nothing before the reveal", () => {
    const state = fixtureState({
      map: EARTH_MAP,
      progress: progressIn("act-3", 0),
    });
    expect(pin(state)).toEqual([]);
  });

  it("pins one oversized, pinned d8 assault per Great Hive in its seat region", () => {
    const state = revealed();
    const offers = pin(state);
    const hives = greatHivesOf(state);
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((m) => m.cityId)).size).toBe(3);
    for (const [n, offer] of offers.entries()) {
      const hive = hives[n];
      if (hive === undefined) {
        throw new Error("Each offer has its Great Hive");
      }
      const seatCities = citiesInRegion(state.map, hive.regionId).map(
        (city) => city.id,
      );
      expect(seatCities).toContain(offer.cityId);
      expect(offer).toMatchObject({
        typeId: "hive-assault",
        storyId: "great-hive",
        pinned: true,
        act: "act-3",
        difficulty: 8,
        hive: {
          hiveId: hive.id,
          regionId: hive.regionId,
          level: 0,
          great: true,
        },
      });
    }
  });

  it("pays the ordinary Hive Assault's tech points times 2.5", () => {
    const ctx = offerContext(1);
    expect(hiveAssaultTechPoints(8, ctx)).toBe(68);
    expect(greatHiveTechPoints(8, ctx)).toBe(170);
    for (const offer of pin(revealed())) {
      expect(offer.rewards.techPoints).toBe(170);
    }
  });

  it("never pins a second offer for a Great Hive already on the board", () => {
    const once = direct(revealed()).state;
    expect(greatOffers(once)).toHaveLength(3);
    expect(pin(once)).toEqual([]);
    const twice = direct(once, 2).state;
    expect(greatOffers(twice).map((m) => m.id)).toEqual(
      greatOffers(once).map((m) => m.id),
    );
  });

  it("pins nothing for a destroyed Great Hive or one held back by a lost assault", () => {
    const state = revealed();
    const [first, second] = greatHivesOf(state);
    if (first === undefined || second === undefined) {
      throw new Error("Three Great Hives stand");
    }
    const held = withGreatHive(
      withGreatHive(state, first.id, { destroyedDay: 199 }),
      second.id,
      { retryDay: 201, level: 1 },
    );
    expect(pin(held).map((m) => m.hive?.hiveId)).toEqual([
      greatHivesOf(state)[2]?.id,
    ]);
    const retried = pin({ ...held, day: 201 });
    expect(retried.map((m) => m.hive?.hiveId).sort()).toEqual(
      [second.id, greatHivesOf(state)[2]?.id].sort(),
    );
    expect(retried.find((m) => m.hive?.hiveId === second.id)?.hive?.level).toBe(
      1,
    );
  });

  it("pins nothing outside Act III", () => {
    const state = revealed();
    expect(
      pin({ ...state, progress: { ...state.progress, act: "finale" } }),
    ).toEqual([]);
  });

  it("ignores the board cap: the board still fills to the act's cap beside it", () => {
    const directed = direct(revealed()).state;
    const capped = directed.missions.filter((m) =>
      countsAgainstCap(m, MISSION_OFFER_RULES),
    );
    expect(greatOffers(directed)).toHaveLength(3);
    expect(capped).toHaveLength(ACTS["act-3"].boardCap);
  });

  it("displaces an ordinary offer when every seat city holds one", () => {
    const state = revealed();
    const [first] = greatHivesOf(state);
    if (first === undefined) {
      throw new Error("A Great Hive stands");
    }
    const seat = citiesInRegion(state.map, first.regionId);
    const crowded: OverworldState = {
      ...state,
      missions: seat.map((city) => missionAt(city.id, 300)),
    };
    const directed = direct(crowded);
    const offer = greatOffers(directed.state).find(
      (m) => m.hive?.hiveId === first.id,
    );
    expect(seat.map((city) => city.id)).toContain(offer?.cityId);
    expect(
      directed.events.some(
        (e) =>
          e.type === MISSION_WITHDRAWN && e.payload.replacedBy === offer?.id,
      ),
    ).toBe(true);
  });

  it("falls back to the continent's other regions when the seat is held by pinned offers", () => {
    const state = revealed();
    const hive = greatHivesOf(state).find((h) => h.regionIds.length > 1);
    if (hive === undefined) {
      throw new Error("Some continent has more than one region");
    }
    const seat = citiesInRegion(state.map, hive.regionId);
    const pinnedSeat: OverworldState = {
      ...state,
      missions: seat.map((city) => ({
        ...missionAt(city.id, 300),
        pinned: true,
      })),
    };
    const offer = pin(pinnedSeat).find((m) => m.hive?.hiveId === hive.id);
    const continentCity = state.map.cities.find((c) => c.id === offer?.cityId);
    expect(continentCity).toBeDefined();
    expect(hive.regionIds).toContain(continentCity?.regionId);
    expect(continentCity?.regionId).not.toBe(hive.regionId);
  });
});
