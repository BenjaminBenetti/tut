import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import { CITY_INFESTATION_CHANGED } from "../../model/city-infestation-changed-event";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import { MISSION_OFFERED } from "../../model/mission-offered-event";
import type { OverworldState } from "../../model/overworld-state";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { setCityInfestation } from "../city-infestation-service";
import { getCity } from "../earth-map-query-service";
import { generateMissions } from "../mission-generation-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { onStoryMissionResolved } from "../story-service";
import {
  FIRST_SKYFALL,
  FIRST_SKYFALL_AFTER_MISSIONS,
  FIRST_SKYFALL_DIFFICULTY,
} from "./first-skyfall";
import { pinContext } from "./story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import { createStoryPinTrigger } from "./story-pin-trigger";

// ===========================================
// Fixtures
// ===========================================

/**
 * The fixture overworld on `day` with `played` missions played in Act I,
 * its worst city cooled from 100 to 80 so a landing anywhere shows.
 */
function campaign(played: number, day = 5): OverworldState {
  const state = fixtureState({ day, progress: progressIn("act-1", played) });
  return setCityInfestation(state, "full", 80).state;
}

/** The shipped director's offers for `state`, with the shipped story table. */
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
    pinTriggers: [createStoryPinTrigger(STORY_MISSION_RULES)],
    hiveTuning: HIVE_TUNING,
  });
}

/** First Skyfall's offer on the board of `state`, if pinned. */
function skyfall(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "first-skyfall");
}

// ===========================================
// The rule
// ===========================================

describe("FIRST_SKYFALL", () => {
  it("is Act I's scripted crash site, pinned with no flag, retried five days after a loss (arc §4, §6.9)", () => {
    expect(STORY_MISSION_RULES["first-skyfall"]).toBe(FIRST_SKYFALL);
    expect(FIRST_SKYFALL.id).toBe("first-skyfall");
    expect(FIRST_SKYFALL.act).toBe("act-1");
    expect(FIRST_SKYFALL.pinWhen).toEqual([]);
    expect(FIRST_SKYFALL.onWon).toEqual([]);
    expect(FIRST_SKYFALL.onLost).toEqual({ kind: "retry", delayDays: 5 });
    expect(STORY_RETRY_DAYS).toBe(5);
    expect(FIRST_SKYFALL_AFTER_MISSIONS).toBe(1);
    expect(FIRST_SKYFALL_DIFFICULTY).toBe(1);
  });

  it("offers nothing until the first mission is played", () => {
    expect(FIRST_SKYFALL.create(campaign(0), pinContext(1))).toBeUndefined();
  });

  it("offers a pinned d1 crash site that carries its landing, once one mission is played", () => {
    const state = campaign(1);
    const offer = FIRST_SKYFALL.create(state, pinContext(1));
    if (offer === undefined) {
      throw new Error("First Skyfall must be offered after mission 1");
    }
    expect(offer).toMatchObject({
      typeId: "crash-site",
      storyId: "first-skyfall",
      pinned: true,
      difficulty: 1,
      act: "act-1",
      mapParams: { size: "small" },
      // d1: 8 + 1 × 3 = 11 tech points, ×1.5.
      rewards: { credits: 300, techPoints: 17 },
    });
    const city = getCity(state.map, offer.cityId);
    expect(offer.crashSite).toEqual({
      landingCityId: city.id,
      preLandingInfestation: city.infestation,
    });
    expect(isMissionExpired(offer, offer.expiresDay + 100)).toBe(false);
  });

  it("lands anywhere free when the player has eyes on no region, so the story never stalls", () => {
    const state = campaign(1);
    const blind: OverworldState = {
      ...state,
      map: {
        ...state.map,
        cities: state.map.cities.map((city) => ({ ...city, detected: false })),
      },
    };
    const offer = FIRST_SKYFALL.create(blind, pinContext(1));
    expect(offer?.storyId).toBe("first-skyfall");
  });
});

// ===========================================
// On the board
// ===========================================

describe("First Skyfall on the board", () => {
  it("is pinned exactly once the first mission is played, and lands its pod", () => {
    expect(skyfall(direct(campaign(0)).state)).toBeUndefined();

    const { state, events } = direct(campaign(1));
    const offer = skyfall(state);
    if (offer?.crashSite === undefined) {
      throw new Error("First Skyfall must be pinned with its landing");
    }
    expect(state.missions[0]).toBe(offer);
    const landing = offer.crashSite;
    expect(getCity(state.map, landing.landingCityId)).toMatchObject({
      infestation: landing.preLandingInfestation + 10,
      detected: true,
    });
    expect(events.slice(0, 2)).toEqual([
      { type: MISSION_OFFERED, payload: { mission: offer } },
      {
        type: CITY_INFESTATION_CHANGED,
        payload: {
          cityId: landing.landingCityId,
          from: landing.preLandingInfestation,
          to: landing.preLandingInfestation + 10,
        },
      },
    ]);
  });

  it("stays pinned without being pinned again, and never expires", () => {
    const once = direct(campaign(1)).state;
    const later = direct({ ...once, day: once.day + 30 }, 2).state;
    expect(
      later.missions.filter((mission) => mission.storyId === "first-skyfall"),
    ).toEqual([skyfall(once)]);
  });

  it("is pinned again five days after a loss, and never after a win", () => {
    const pinned = direct(campaign(1, 10)).state;
    const offer = skyfall(pinned);
    if (offer === undefined) {
      throw new Error("First Skyfall must be pinned");
    }
    const played: OverworldState = {
      ...pinned,
      missions: pinned.missions.filter((mission) => mission !== offer),
      progress: { ...pinned.progress, missionsPlayed: 2 },
    };
    const story = {
      rules: STORY_MISSION_RULES,
      spine: STORY_SPINE,
      ids: new SequentialIdGenerator(),
    };

    const lost = onStoryMissionResolved(
      played,
      offer,
      resultFor(offer, "lost", 0),
      story,
    ).state;
    const on = (day: number) => skyfall(direct({ ...lost, day }).state);
    expect(on(10)).toBeUndefined();
    expect(on(14)).toBeUndefined();
    expect(on(10 + STORY_RETRY_DAYS)?.storyId).toBe("first-skyfall");

    const won = onStoryMissionResolved(
      played,
      offer,
      resultFor(offer, "won", 0),
      story,
    ).state;
    expect(skyfall(direct({ ...won, day: 40 }).state)).toBeUndefined();
  });
});
