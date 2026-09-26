import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import { ACT_ADVANCED } from "../../model/act-advanced-event";
import { CAMPAIGN_FLAG_SET } from "../../model/campaign-flag-set-event";
import type { CampaignState } from "../../model/campaign-state";
import { HIVE_FORMED } from "../../model/hive-formed-event";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import type { MissionOutcome } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { generateMissions } from "../mission-generation-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { evaluateOutcome } from "../outcome-service";
import { onStoryMissionResolved } from "../story-service";
import { LIVE_SPECIMEN, LIVE_SPECIMEN_DIFFICULTY } from "./live-specimen";
import { createStoryPinTrigger } from "./story-pin-trigger";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import { fixtureStoryRule, storyRulesOf } from "./story-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/**
 * The fixture overworld on `day`, four missions into Act I with First
 * Skyfall won (so it does not take the board first), with `flags` set.
 * Its detected infested cities: low 10, mid 50, full 100 (clean is at 0,
 * so undetected).
 */
function campaign(
  flags: readonly CampaignFlagId[],
  day = 5,
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({
    day,
    progress: {
      ...progressIn("act-1", 4),
      flags,
      storyWon: ["first-skyfall"],
    },
    ...overrides,
  });
}

/** The shipped director's offers for `state`, with `rules` as the story table. */
function direct(
  state: OverworldState,
  seed = 1,
  rules: StoryMissionRules = STORY_MISSION_RULES,
) {
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
    pinTriggers: [createStoryPinTrigger(rules)],
  });
}

/** Live Specimen's offer on the board of `state`, if pinned. */
function specimen(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "live-specimen");
}

/** Live Specimen's offer on `state`, or a thrown error when it finds no city. */
function offerOn(state: OverworldState): Mission {
  const offer = LIVE_SPECIMEN.create(state, offerContext(1));
  if (offer === undefined) {
    throw new Error("Live Specimen must find a city");
  }
  return offer;
}

/**
 * Resolves the pinned offer on `state` to `outcome` through the story
 * layer, with `rules` as the story table and the shipped spine, after
 * taking it off the board as the resolver does.
 */
function play(
  state: OverworldState,
  outcome: MissionOutcome,
  rules: StoryMissionRules = STORY_MISSION_RULES,
) {
  const offer = specimen(state);
  if (offer === undefined) {
    throw new Error("Live Specimen must be pinned");
  }
  const played: OverworldState = {
    ...state,
    missions: state.missions.filter((mission) => mission !== offer),
    progress: {
      ...state.progress,
      missionsPlayed: state.progress.missionsPlayed + 1,
    },
  };
  return onStoryMissionResolved(played, offer, resultFor(offer, outcome, 0), {
    rules,
    spine: STORY_SPINE,
    ids: new SequentialIdGenerator(),
  });
}

/** A campaign around `overworld`, for the outcome step. */
function campaignOf(overworld: OverworldState): CampaignState {
  return {
    meta: {
      rng: new Mulberry32Rng(1).getState(),
      ids: new SequentialIdGenerator().getState(),
    },
    overworld,
    roster: { squads: [], mechs: [], savedLoadouts: [], graveyard: [] },
    economy: { credits: 0, ledger: [], techPoints: 0 },
    tech: { unlocked: [] },
  };
}

// ===========================================
// The rule
// ===========================================

describe("LIVE_SPECIMEN", () => {
  it("is Act I's ending: pinned by the capture net, advancing the act, retried five days after a loss (arc §4, §6.9)", () => {
    expect(STORY_MISSION_RULES["live-specimen"]).toBe(LIVE_SPECIMEN);
    expect(LIVE_SPECIMEN.id).toBe("live-specimen");
    expect(LIVE_SPECIMEN.act).toBe("act-1");
    expect(LIVE_SPECIMEN.pinWhen).toEqual(["capture-net"]);
    expect(LIVE_SPECIMEN.onWon).toEqual([{ kind: "advance-act" }]);
    expect(LIVE_SPECIMEN.onLost).toEqual({ kind: "retry", delayDays: 5 });
    expect(STORY_SPINE["act-1"].endedBy).toBe("live-specimen");
    expect(LIVE_SPECIMEN_DIFFICULTY).toBe(3);
    // Inside Act I's band, so the fixed difficulty is what the player sees.
    expect(LIVE_SPECIMEN_DIFFICULTY).toBeLessThanOrEqual(
      ACTS["act-1"].difficultyBand.max,
    );
  });

  it("offers a pinned d3 clearance at the worst detected infested city, never expiring", () => {
    const offer = offerOn(campaign(["capture-net"]));
    expect(offer).toMatchObject({
      typeId: "infestation-clearance",
      storyId: "live-specimen",
      cityId: "full",
      pinned: true,
      difficulty: 3,
      act: "act-1",
      mapParams: { size: "small" },
    });
    expect(isMissionExpired(offer, offer.expiresDay + 100)).toBe(false);
  });

  it("skips a city that already holds an offer, and an undetected one", () => {
    const occupied = campaign(["capture-net"], 5, {
      missions: [missionAt("full", 30)],
    });
    expect(offerOn(occupied).cityId).toBe("mid");

    const base = campaign(["capture-net"]);
    const hidden: OverworldState = {
      ...base,
      map: {
        ...base.map,
        cities: base.map.cities.map((city) =>
          city.id === "full" ? { ...city, detected: false } : city,
        ),
      },
    };
    expect(offerOn(hidden).cityId).toBe("mid");
  });

  it("offers nothing while no detected city is infested and free, so it is asked again tomorrow", () => {
    const base = campaign(["capture-net"]);
    const blind: OverworldState = {
      ...base,
      map: {
        ...base.map,
        cities: base.map.cities.map((city) => ({ ...city, detected: false })),
      },
    };
    expect(LIVE_SPECIMEN.create(blind, offerContext(1))).toBeUndefined();
    expect(specimen(direct(blind).state)).toBeUndefined();
  });
});

// ===========================================
// On the board
// ===========================================

describe("Live Specimen on the board", () => {
  it("is pinned only once the capture net is researched", () => {
    expect(specimen(direct(campaign([])).state)).toBeUndefined();
    expect(specimen(direct(campaign(["spore-sample"])).state)).toBeUndefined();

    const { state } = direct(campaign(["spore-sample", "capture-net"]));
    const offer = specimen(state);
    expect(offer).toMatchObject({ pinned: true, cityId: "full" });
    expect(state.missions[0]).toBe(offer);
  });

  it("is not pinned outside Act I", () => {
    const later = campaign(["capture-net"], 5, {
      progress: {
        ...progressIn("act-2", 4),
        flags: ["capture-net"],
        storyWon: ["first-skyfall"],
      },
    });
    expect(specimen(direct(later).state)).toBeUndefined();
  });

  it("stays pinned without being pinned again, and never expires", () => {
    const once = direct(campaign(["capture-net"])).state;
    const later = direct({ ...once, day: once.day + 30 }, 2).state;
    expect(
      later.missions.filter((mission) => mission.storyId === "live-specimen"),
    ).toEqual([specimen(once)]);
  });
});

// ===========================================
// Won and lost
// ===========================================

describe("Live Specimen resolved", () => {
  it("wins the campaign when won while Act II has no ending built", () => {
    const pinned = direct(campaign(["capture-net"])).state;
    const won = play(pinned, "won");
    expect(won.state.progress.storyWon).toEqual([
      "first-skyfall",
      "live-specimen",
    ]);
    expect(won.state.progress.act).toBe("act-1");
    expect(won.state.progress.flags).toEqual(["capture-net", "campaign-won"]);
    expect(won.events.map((event) => event.type)).toEqual([CAMPAIGN_FLAG_SET]);
    expect(evaluateOutcome(campaignOf(won.state))).toMatchObject({
      kind: "victory",
      cause: "story",
    });
    // Never pinned again.
    expect(specimen(direct({ ...won.state, day: 40 }).state)).toBeUndefined();
  });

  it("moves the campaign into Act II when Act II's ending exists, forming the first hive", () => {
    const rules = storyRulesOf(
      LIVE_SPECIMEN,
      fixtureStoryRule("intact-pod", { act: "act-2" }),
    );
    const pinned = direct(campaign(["capture-net"]), 1, rules).state;
    const won = play(pinned, "won", rules);
    expect(won.state.progress).toMatchObject({
      act: "act-2",
      storyWon: ["first-skyfall", "live-specimen"],
      flags: ["capture-net"],
    });
    expect(won.state.hives).toHaveLength(1);
    expect(won.events.map((event) => event.type)).toEqual([
      ACT_ADVANCED,
      HIVE_FORMED,
    ]);
    expect(won.events[0]?.payload).toEqual({ from: "act-1", to: "act-2" });
    expect(evaluateOutcome(campaignOf(won.state))).toBeUndefined();
  });

  it.each<MissionOutcome>(["lost", "extracted"])(
    "is pinned again five days after it ends %s",
    (outcome) => {
      const pinned = direct(campaign(["capture-net"], 10)).state;
      const lost = play(pinned, outcome).state;
      expect(lost.progress.storyWon).toEqual(["first-skyfall"]);
      expect(lost.progress.storyRetryDay).toEqual({
        "live-specimen": 10 + STORY_RETRY_DAYS,
      });
      const on = (day: number) => specimen(direct({ ...lost, day }).state);
      expect(on(10)).toBeUndefined();
      expect(on(10 + STORY_RETRY_DAYS - 1)).toBeUndefined();
      expect(on(10 + STORY_RETRY_DAYS)?.storyId).toBe("live-specimen");
      expect(evaluateOutcome(campaignOf(lost))).toBeUndefined();
    },
  );
});
