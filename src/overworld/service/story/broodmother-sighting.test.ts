import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { NEMESIS_LORE } from "../../data/nemesis-lore";
import { STORY_SPINE } from "../../data/story-spine";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import type { MissionOutcome } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { hasFlag } from "../campaign-progress-service";
import { generateMissions } from "../mission-generation-service";
import { BROODMOTHER_SIGHTED_FLAG } from "../missions/alpha-hunt-quarry";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { onStoryMissionResolved } from "../story-service";
import { BROODMOTHER_SIGHTING_DIFFICULTY } from "./broodmother-sighting";
import { createStoryPinTrigger } from "./story-pin-trigger";
import { STORY_MISSION_RULES } from "./story-mission-rules";

// ===========================================
// Fixtures
// ===========================================

/**
 * The fixture overworld in Act II with `played` missions played in it,
 * a hive in the east, and nothing on the board. Detected cities: low
 * (west, 10), mid and full (east, 50 and 100).
 */
function campaign(played: number, day = 30): OverworldState {
  return fixtureState({
    day,
    hives: [{ id: "hive-1", regionId: "east", formedDay: 1 }],
    progress: { ...progressIn("act-2", played), storyWon: ["first-skyfall"] },
  });
}

/** One day of the shipped director on `state`. */
function direct(state: OverworldState, seed = 1): OverworldState {
  return generateMissions(state, {
    intelBonus: {},
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning: MISSION_TUNING,
    hiveTuning: HIVE_TUNING,
    missionTypes: MISSION_TYPES,
    offerRules: MISSION_OFFER_RULES,
    consequences: MISSION_CONSEQUENCE_RULES,
    acts: ACTS,
    decorators: [],
    pinTriggers: [createStoryPinTrigger(STORY_MISSION_RULES)],
  }).state;
}

/** The sighting on the board of `state`, if pinned. */
function sighting(state: OverworldState): Mission | undefined {
  return state.missions.find(
    (mission) => mission.storyId === "broodmother-sighting",
  );
}

/** Every Alpha Hunt on the board of `state`. */
function hunts(state: OverworldState): readonly Mission[] {
  return state.missions.filter((mission) => mission.typeId === "alpha-hunt");
}

/**
 * The sighting on `state` played to `outcome` as the launch handler
 * plays it: off the board, counted, its type's consequences, then the
 * story layer.
 */
function play(state: OverworldState, outcome: MissionOutcome): OverworldState {
  const offer = sighting(state);
  if (offer === undefined) {
    throw new Error("the sighting must be pinned");
  }
  const result = {
    ...resultFor(offer, outcome, 0),
    broodmotherKilled: outcome === "won",
  };
  const counted: OverworldState = {
    ...state,
    missions: state.missions.filter((mission) => mission !== offer),
    progress: {
      ...state.progress,
      missionsPlayed: state.progress.missionsPlayed + 1,
    },
  };
  const typed = MISSION_CONSEQUENCE_RULES["alpha-hunt"].onResolved(
    counted,
    offer,
    result,
    { tuning: MISSION_TUNING, hive: HIVE_TUNING },
  );
  return onStoryMissionResolved(typed.state, offer, result, {
    rules: STORY_MISSION_RULES,
    spine: STORY_SPINE,
    ids: new SequentialIdGenerator(),
  }).state;
}

// ===========================================
// The rule
// ===========================================

describe("Broodmother sighting", () => {
  it("is Act II's scripted first hunt at d5, inside the act's band", () => {
    const rule = STORY_MISSION_RULES["broodmother-sighting"];
    expect(rule).toMatchObject({
      id: "broodmother-sighting",
      act: "act-2",
      pinWhen: [],
      onWon: [],
    });
    expect(BROODMOTHER_SIGHTING_DIFFICULTY).toBe(5);
    const band = ACTS["act-2"].difficultyBand;
    expect(BROODMOTHER_SIGHTING_DIFFICULTY).toBeGreaterThanOrEqual(band.min);
    expect(BROODMOTHER_SIGHTING_DIFFICULTY).toBeLessThanOrEqual(band.max);
  });

  it("is pinned the day Alpha Hunt debuts, at the worst city of a hive region, never expiring", () => {
    expect(sighting(direct(campaign(9)))).toBeUndefined();
    const state = direct(campaign(10));
    const offer = sighting(state);
    expect(offer).toMatchObject({
      typeId: "alpha-hunt",
      storyId: "broodmother-sighting",
      cityId: "full",
      pinned: true,
      difficulty: 5,
      act: "act-2",
      mapParams: { size: "medium" },
    });
    expect(offer?.alphaHunt?.scars).toBe(0);
    expect(NEMESIS_LORE.broodmotherNames).toContain(offer?.alphaHunt?.name);
    expect(offer === undefined || isMissionExpired(offer, 999)).toBe(false);
  });

  it("waits for a hive: none in any region, none pinned", () => {
    const hiveless = { ...campaign(10), hives: [] };
    expect(sighting(direct(hiveless))).toBeUndefined();
  });

  it("holds the ordinary hunts back while it waits on the board", () => {
    let state = direct(campaign(10));
    for (let day = 1; day <= 5; day++) {
      state = direct({ ...state, day: state.day + 1 }, day + 1);
      expect(hunts(state)).toEqual([sighting(state)]);
    }
  });

  it.each<MissionOutcome>(["won", "lost", "extracted"])(
    "is offered once and never again once played (%s), and the ordinary hunts take over",
    (outcome) => {
      const after = play(direct(campaign(10)), outcome);
      expect(hasFlag(after.progress, BROODMOTHER_SIGHTED_FLAG)).toBe(true);
      let state = after;
      for (let day = 1; day <= STORY_RETRY_DAYS + 5; day++) {
        state = direct({ ...state, day: state.day + 1, missions: [] }, day);
        expect(sighting(state)).toBeUndefined();
      }
      const rule = MISSION_OFFER_RULES["alpha-hunt"];
      const sites =
        rule.kind === "offer"
          ? rule.eligible(
              { ...after, missions: [] },
              {
                rng: new Mulberry32Rng(1),
                ids: new SequentialIdGenerator(),
                tuning: MISSION_TUNING,
                hive: HIVE_TUNING,
                missionTypes: MISSION_TYPES,
                intelBonus: {},
                act: ACTS["act-2"],
              },
            )
          : [];
      expect(sites.map((site) => site.cityId)).toEqual(["mid", "full"]);
    },
  );
});
