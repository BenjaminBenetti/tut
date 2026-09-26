import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import { ACT_ADVANCED } from "../../model/act-advanced-event";
import { CAMPAIGN_FLAG_SET } from "../../model/campaign-flag-set-event";
import type { CampaignState } from "../../model/campaign-state";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import type { MissionOutcome, MissionResult } from "../../model/mission-result";
import { MISSION_WITHDRAWN } from "../../model/mission-withdrawn-event";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { getCity } from "../earth-map-query-service";
import { generateMissions } from "../mission-generation-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  installation,
  missionAt,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { evaluateOutcome } from "../outcome-service";
import { onStoryMissionResolved } from "../story-service";
import { INTACT_POD, INTACT_POD_DIFFICULTY } from "./intact-pod";
import { createStoryPinTrigger } from "./story-pin-trigger";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import {
  fixtureStoryRule,
  pinContext,
  storyRulesOf,
} from "./story-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

/**
 * The fixture overworld on `day`, four missions into Act II with the
 * earlier story won, with `flags` set. Its detected cities: low 10
 * (west), mid 50 and full 100 (east); clean is at 0, so undetected.
 */
function campaign(
  flags: readonly CampaignFlagId[],
  day = 5,
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({
    day,
    progress: {
      ...progressIn("act-2", 4),
      flags,
      storyWon: ["first-skyfall", "live-specimen"],
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
    hiveTuning: HIVE_TUNING,
  });
}

/** Intact Pod's offer on the board of `state`, if pinned. */
function pod(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "intact-pod");
}

/** Intact Pod's offer on `state`, or a thrown error when it finds no city. */
function offerOn(state: OverworldState): Mission {
  const offer = INTACT_POD.create(state, pinContext(1));
  if (offer === undefined) {
    throw new Error("Intact Pod must find a city");
  }
  return offer;
}

/** `state` with an online sensor array in `regionId`. */
function watched(state: OverworldState, regionId: string): OverworldState {
  return { ...state, deployables: [installation("array", regionId)] };
}

/**
 * Resolves the pinned offer on `state` to `outcome` through the crash
 * site's consequence and then the story layer, as the launch handler
 * does, with `rules` as the story table and the shipped spine.
 */
function play(
  state: OverworldState,
  outcome: MissionOutcome,
  rules: StoryMissionRules = STORY_MISSION_RULES,
  result: Partial<MissionResult> = {},
) {
  const offer = pod(state);
  if (offer === undefined) {
    throw new Error("Intact Pod must be pinned");
  }
  const played: OverworldState = {
    ...state,
    missions: state.missions.filter((mission) => mission !== offer),
    progress: {
      ...state.progress,
      missionsPlayed: state.progress.missionsPlayed + 1,
    },
  };
  const resolved = { ...resultFor(offer, outcome, 0), ...result };
  const consequence = MISSION_CONSEQUENCE_RULES["crash-site"].onResolved(
    played,
    offer,
    resolved,
    { tuning: MISSION_TUNING, hive: HIVE_TUNING },
  );
  return onStoryMissionResolved(consequence.state, offer, resolved, {
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

/** The recovery row a tactical result reports, recovered or not. */
function recovery(complete: boolean): Partial<MissionResult> {
  return {
    objectives: [{ kind: "recover-pod", complete, failed: !complete }],
    podRecovered: complete,
    podHpLeft: complete ? 40 : 0,
  };
}

// ===========================================
// The rule
// ===========================================

describe("INTACT_POD", () => {
  it("is Act II's ending: pinned by Pod Telemetry, advancing the act, retried five days after a loss (arc §4, §6.9)", () => {
    expect(STORY_MISSION_RULES["intact-pod"]).toBe(INTACT_POD);
    expect(INTACT_POD.id).toBe("intact-pod");
    expect(INTACT_POD.act).toBe("act-2");
    expect(INTACT_POD.pinWhen).toEqual(["pod-telemetry"]);
    expect(INTACT_POD.onWon).toEqual([{ kind: "advance-act" }]);
    expect(INTACT_POD.onLost).toEqual({ kind: "retry", delayDays: 5 });
    expect(STORY_SPINE["act-2"].endedBy).toBe("intact-pod");
    expect(INTACT_POD_DIFFICULTY).toBe(6);
    // Inside Act II's band, so the fixed difficulty is what the player sees.
    expect(INTACT_POD_DIFFICULTY).toBeGreaterThanOrEqual(
      ACTS["act-2"].difficultyBand.min,
    );
    expect(INTACT_POD_DIFFICULTY).toBeLessThanOrEqual(
      ACTS["act-2"].difficultyBand.max,
    );
  });

  it("offers a pinned d6 crash site carrying its landing, never expiring", () => {
    const state = campaign(["pod-telemetry"]);
    const offer = offerOn(state);
    expect(offer).toMatchObject({
      typeId: "crash-site",
      storyId: "intact-pod",
      cityId: "low",
      pinned: true,
      difficulty: 6,
      act: "act-2",
      crashSite: {
        landingCityId: "low",
        preLandingInfestation: getCity(state.map, "low").infestation,
      },
    });
    expect(isMissionExpired(offer, offer.expiresDay + 100)).toBe(false);
  });

  it("takes the least-infested detected city, and skips an undetected one", () => {
    // clean (0) is undetected, so low (10) is the least infested seen.
    expect(offerOn(campaign(["pod-telemetry"])).cityId).toBe("low");
  });

  it("takes a city a sensor array watches when there is one, the least infested of them", () => {
    const east = watched(campaign(["pod-telemetry"]), "east");
    expect(offerOn(east).cityId).toBe("mid");
    const west = watched(campaign(["pod-telemetry"]), "west");
    expect(offerOn(west).cityId).toBe("low");
    // An array that is offline watches nothing.
    const dark: OverworldState = {
      ...east,
      deployables: east.deployables.map((d) => ({ ...d, online: false })),
    };
    expect(offerOn(dark).cityId).toBe("low");
  });

  it("goes through pickStoryCity: a free city first, then an ordinary offer's, never a pinned one's", () => {
    const occupied = campaign(["pod-telemetry"], 5, {
      missions: [missionAt("low", 30)],
    });
    expect(offerOn(occupied).cityId).toBe("mid");

    const crowded = campaign(["pod-telemetry"], 5, {
      missions: [
        missionAt("low", 30),
        missionAt("mid", 30),
        missionAt("full", 30),
      ],
    });
    const { state, events } = direct(crowded);
    expect(pod(state)?.cityId).toBe("low");
    expect(
      events
        .filter((event) => event.type === MISSION_WITHDRAWN)
        .map((event) => event.payload.missionId),
    ).toEqual(["mission-low"]);

    const locked = campaign(["pod-telemetry"], 5, {
      missions: ["low", "mid", "full"].map((city) => ({
        ...missionAt(city, 30),
        pinned: true,
      })),
    });
    expect(INTACT_POD.create(locked, pinContext(1))).toBeUndefined();
    expect(pod(direct(locked).state)).toBeUndefined();
  });
});

// ===========================================
// On the board
// ===========================================

describe("Intact Pod on the board", () => {
  it("is pinned only once Pod Telemetry is researched", () => {
    expect(pod(direct(campaign([])).state)).toBeUndefined();
    expect(pod(direct(campaign(["hive-core-sample"])).state)).toBeUndefined();
    const { state } = direct(campaign(["hive-core-sample", "pod-telemetry"]));
    expect(pod(state)).toMatchObject({ pinned: true, cityId: "low" });
  });

  it("is not pinned outside Act II", () => {
    for (const act of ["act-1", "act-3"] as const) {
      const elsewhere = campaign(["pod-telemetry"], 5, {
        progress: {
          ...progressIn(act, 4),
          flags: ["pod-telemetry"],
          storyWon: ["first-skyfall", "live-specimen"],
        },
      });
      expect(pod(direct(elsewhere).state)).toBeUndefined();
    }
  });

  it("lands its pod as a crash site does when it is offered: +10 at the city, seen", () => {
    const before = campaign(["pod-telemetry"]);
    const { state } = direct(before);
    const landing = MISSION_TUNING.crashSite.landingInfestation;
    expect(getCity(state.map, "low").infestation).toBe(
      getCity(before.map, "low").infestation + landing,
    );
  });

  it("stays pinned without being pinned again, and never expires", () => {
    const once = direct(campaign(["pod-telemetry"])).state;
    const later = direct({ ...once, day: once.day + 30 }, 2).state;
    expect(
      later.missions.filter((mission) => mission.storyId === "intact-pod"),
    ).toEqual([pod(once)]);
  });
});

// ===========================================
// Won and lost
// ===========================================

describe("Intact Pod resolved", () => {
  /** What an Act II campaign has picked up by the time the pod pins. */
  const researched: readonly CampaignFlagId[] = [
    "spore-sample",
    "capture-net",
    "hive-core-sample",
    "pod-telemetry",
  ];
  /** Live Specimen and Intact Pod built, Act III's ending not. */
  const noActThree = storyRulesOf(
    fixtureStoryRule("live-specimen", { onWon: [{ kind: "advance-act" }] }),
    INTACT_POD,
  );
  /** Every act up to Act III built, as a fixture. */
  const withActThree = storyRulesOf(
    fixtureStoryRule("live-specimen", { onWon: [{ kind: "advance-act" }] }),
    INTACT_POD,
    fixtureStoryRule("launch-window", {
      act: "act-3",
      onWon: [{ kind: "advance-act" }],
    }),
  );

  it("wins the campaign when won while Act III has no ending built", () => {
    const pinned = direct(campaign(researched), 1, noActThree).state;
    const won = play(pinned, "won", noActThree, recovery(true));
    expect(won.state.progress.storyWon).toEqual([
      "first-skyfall",
      "live-specimen",
      "intact-pod",
    ]);
    expect(won.state.progress.act).toBe("act-2");
    expect(won.state.progress.flags).toEqual([...researched, "campaign-won"]);
    expect(evaluateOutcome(campaignOf(won.state))).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("moves the campaign into Act III when Act III's ending exists", () => {
    const pinned = direct(campaign(researched), 1, withActThree).state;
    const won = play(pinned, "won", withActThree, recovery(true));
    expect(won.state.progress).toMatchObject({
      act: "act-3",
      flags: researched,
    });
    expect(
      won.events.filter((event) => event.type === ACT_ADVANCED),
    ).toHaveLength(1);
    expect(
      won.events.filter((event) => event.type === CAMPAIGN_FLAG_SET),
    ).toEqual([]);
    expect(evaluateOutcome(campaignOf(won.state))).toBeUndefined();
    // Never pinned again.
    expect(pod(direct({ ...won.state, day: 60 }).state)).toBeUndefined();
  });

  it("enters Act III with the shipped story table, where Launch Window ends it", () => {
    const pinned = direct(campaign(["pod-telemetry"])).state;
    const won = play(pinned, "won", STORY_MISSION_RULES, recovery(true));
    expect(won.state.progress.act).toBe("act-3");
    expect(won.state.progress.flags).not.toContain("campaign-won");
  });

  it("erases the landing on a win, and lets it take root on a loss", () => {
    const before = campaign(["pod-telemetry"]);
    const pinned = direct(before).state;
    const preLanding = getCity(before.map, "low").infestation;
    const won = play(pinned, "won", STORY_MISSION_RULES, recovery(true));
    expect(getCity(won.state.map, "low").infestation).toBe(preLanding);
    const lost = play(
      pinned,
      "extracted",
      STORY_MISSION_RULES,
      recovery(false),
    );
    const offer = pod(pinned);
    expect(getCity(lost.state.map, "low").infestation).toBe(
      getCity(pinned.map, "low").infestation + (offer?.ignorePenalty ?? NaN),
    );
  });

  it.each<MissionOutcome>(["lost", "extracted"])(
    "is pinned again five days after it ends %s",
    (outcome) => {
      const pinned = direct(campaign(["pod-telemetry"], 10)).state;
      const lost = play(
        pinned,
        outcome,
        STORY_MISSION_RULES,
        recovery(false),
      ).state;
      expect(lost.progress.storyWon).toEqual([
        "first-skyfall",
        "live-specimen",
      ]);
      expect(lost.progress.storyRetryDay).toEqual({
        "intact-pod": 10 + STORY_RETRY_DAYS,
      });
      const on = (day: number) => pod(direct({ ...lost, day }).state);
      expect(on(10)).toBeUndefined();
      expect(on(10 + STORY_RETRY_DAYS - 1)).toBeUndefined();
      expect(on(10 + STORY_RETRY_DAYS)?.storyId).toBe("intact-pod");
      expect(evaluateOutcome(campaignOf(lost))).toBeUndefined();
    },
  );
});
