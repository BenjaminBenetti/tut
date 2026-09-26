import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import type { TechNode } from "../../tech/model/tech-node";
import { STORY_SPINE } from "../data/story-spine";
import { ACT_ADVANCED } from "../model/act-advanced-event";
import { CAMPAIGN_FLAG_SET } from "../model/campaign-flag-set-event";
import type { CampaignState } from "../model/campaign-state";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import { HIVE_FORMED } from "../model/hive-formed-event";
import type { Mission } from "../model/mission";
import type { MissionOutcome } from "../model/mission-result";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type {
  StoryEffect,
  StoryMissionRule,
  StoryMissionRules,
} from "../model/story-mission-rule";
import {
  PLATFORM_FAILURE_INFESTATION,
  STORY_RETRY_DAYS,
} from "../model/story-mission-rule";
import { getCity } from "./earth-map-query-service";
import {
  fixtureState,
  missionAt,
  progressIn,
  resultFor,
} from "./missions/mission-fixtures.test-helper";
import { evaluateOutcome } from "./outcome-service";
import {
  fixtureStoryRule,
  pinContext,
  storyRulesOf,
} from "./story/story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "./story/story-mission-rules";
import type { StoryResolutionContext } from "./story-service";
import {
  actExists,
  applyStoryEffects,
  isStoryPinnable,
  isStoryWon,
  nextActOf,
  onStoryMissionResolved,
  onTechUnlocked,
  setCampaignFlag,
} from "./story-service";

// ===========================================
// Fixtures
// ===========================================

/** A story context over `rules` and the shipped spine. */
function storyContext(rules: StoryMissionRules): StoryResolutionContext {
  return { rules, spine: STORY_SPINE, ids: new SequentialIdGenerator() };
}

/** The fixture overworld with `flags` set, in `act`. */
function flagged(
  flags: readonly CampaignFlagId[],
  overrides: Partial<OverworldState> = {},
  act: OverworldState["progress"]["act"] = "act-1",
): OverworldState {
  return fixtureState({
    progress: { ...progressIn(act, 4), flags },
    ...overrides,
  });
}

/** The pinned offer `rule` makes on `state`. */
function offerOf(rule: StoryMissionRule, state: OverworldState): Mission {
  const mission = rule.create(state, pinContext(3));
  if (mission === undefined) {
    throw new Error("fixture rule found no site");
  }
  return mission;
}

/** A story offer for `rule` without building one: a pinned clearance on "mid". */
function storyMission(rule: StoryMissionRule): Mission {
  return {
    ...missionAt("mid", 30),
    pinned: true,
    storyId: rule.id,
    act: rule.act,
  };
}

/** Plays `rule`'s mission on `state` to `outcome`. */
function play(
  state: OverworldState,
  rule: StoryMissionRule,
  outcome: MissionOutcome,
  rules: StoryMissionRules = storyRulesOf(rule),
): OverworldApplied<OverworldState> {
  const mission = storyMission(rule);
  return onStoryMissionResolved(
    state,
    mission,
    resultFor(mission, outcome, 0),
    storyContext(rules),
  );
}

/** A campaign around `overworld`, for the tech hook and the outcome step. */
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

/** A story node whose effects are `effects`. */
function node(effects: TechNode["effects"]): TechNode {
  return {
    id: "tech.fx-story",
    name: "Story",
    description: "A story node.",
    family: "support",
    kind: "story",
    tier: 2,
    cost: 10,
    requires: [],
    effects,
  };
}

const ADVANCE: readonly StoryEffect[] = [{ kind: "advance-act" }];

/** The Act I gate: wins advance the act. */
const LIVE_SPECIMEN = fixtureStoryRule("live-specimen", { onWon: ADVANCE });

/** The Act II gate, so Act II exists. */
const INTACT_POD = fixtureStoryRule("intact-pod", {
  act: "act-2",
  onWon: ADVANCE,
});

/** Act III's ending, so Act III can exist. */
const LAUNCH_WINDOW = fixtureStoryRule("launch-window", {
  act: "act-3",
  onWon: ADVANCE,
});

/** The finale's platform, with D7's loss rule. */
const SPORE_PLATFORM = fixtureStoryRule("spore-platform", {
  act: "finale",
  pinWhen: ["last-hope"],
  onWon: [{ kind: "victory" }],
  onLost: { kind: "platform", cityInfestation: PLATFORM_FAILURE_INFESTATION },
});

// ===========================================
// Tech unlocks
// ===========================================

describe("onTechUnlocked", () => {
  it("records every flag effect in order, one CampaignFlagSet per new flag", () => {
    const campaign = campaignOf(flagged([]));
    const applied = onTechUnlocked(
      campaign,
      node([
        { kind: "flag", flag: "capture-net" },
        { kind: "part", partId: "legs-jumper" },
        { kind: "flag", flag: "last-hope" },
      ]),
    );
    expect(applied.state.overworld.progress.flags).toEqual([
      "capture-net",
      "last-hope",
    ]);
    expect(applied.events).toEqual([
      { type: CAMPAIGN_FLAG_SET, payload: { flag: "capture-net" } },
      { type: CAMPAIGN_FLAG_SET, payload: { flag: "last-hope" } },
    ]);
    expect(applied.state.tech).toBe(campaign.tech);
  });

  it("returns the campaign itself for a node with no new campaign flag", () => {
    const campaign = campaignOf(flagged(["capture-net"]));
    for (const effects of [
      [{ kind: "part", partId: "legs-jumper" }],
      [{ kind: "flag", flag: "not-a-campaign-flag" }],
      [{ kind: "flag", flag: "capture-net" }],
    ] as const) {
      const applied = onTechUnlocked(campaign, node(effects));
      expect(applied.state).toBe(campaign);
      expect(applied.events).toEqual([]);
    }
  });
});

// ===========================================
// Flags
// ===========================================

describe("setCampaignFlag", () => {
  it("sets a new flag with an event and leaves a held one alone", () => {
    const state = flagged([]);
    const first = setCampaignFlag(state, "spore-sample");
    expect(first.state.progress.flags).toEqual(["spore-sample"]);
    expect(first.events).toEqual([
      { type: CAMPAIGN_FLAG_SET, payload: { flag: "spore-sample" } },
    ]);
    const again = setCampaignFlag(first.state, "spore-sample");
    expect(again.state).toBe(first.state);
    expect(again.events).toEqual([]);
  });
});

// ===========================================
// Resolution
// ===========================================

describe("onStoryMissionResolved", () => {
  it("changes nothing for an offer with no story id, or a story mission not built", () => {
    const state = flagged([]);
    const plain = missionAt("mid", 30);
    const ctx = storyContext(storyRulesOf(LIVE_SPECIMEN));
    const none = onStoryMissionResolved(
      state,
      plain,
      resultFor(plain, "won", 0),
      ctx,
    );
    expect(none.state).toBe(state);
    const unbuilt = { ...plain, pinned: true, storyId: "uplink" as const };
    const absent = onStoryMissionResolved(
      state,
      unbuilt,
      resultFor(unbuilt, "won", 0),
      ctx,
    );
    expect(absent.state).toBe(state);
    expect(absent.events).toEqual([]);
  });

  it("records a win once and applies its flag effects in order", () => {
    const rule = fixtureStoryRule("first-skyfall", {
      onWon: [
        { kind: "flag", flag: "spore-sample" },
        { kind: "flag", flag: "hive-core-sample" },
      ],
    });
    const won = play(flagged([]), rule, "won");
    expect(won.state.progress.storyWon).toEqual(["first-skyfall"]);
    expect(won.state.progress.flags).toEqual([
      "spore-sample",
      "hive-core-sample",
    ]);
    expect(won.events.map((event) => event.type)).toEqual([
      CAMPAIGN_FLAG_SET,
      CAMPAIGN_FLAG_SET,
    ]);
    expect(isStoryWon(won.state.progress, "first-skyfall")).toBe(true);
    expect(play(won.state, rule, "won").state.progress.storyWon).toEqual([
      "first-skyfall",
    ]);
  });

  it("delays a lost or extracted story mission by five days, then it may pin again", () => {
    for (const outcome of ["lost", "extracted"] as const) {
      const lost = play(flagged([]), LIVE_SPECIMEN, outcome);
      expect(lost.state.progress.storyRetryDay).toEqual({
        "live-specimen": 5 + STORY_RETRY_DAYS,
      });
      expect(lost.state.progress.storyWon).toBeUndefined();
      expect(lost.state.progress.act).toBe("act-1");
      const onDay = (day: number): boolean =>
        isStoryPinnable(LIVE_SPECIMEN, { ...lost.state, day });
      expect(onDay(5)).toBe(false);
      expect(onDay(5 + STORY_RETRY_DAYS - 1)).toBe(false);
      expect(onDay(5 + STORY_RETRY_DAYS)).toBe(true);
    }
  });

  it("drops the retry delay once the mission is won", () => {
    const lost = play(flagged([]), LIVE_SPECIMEN, "lost");
    const later = { ...lost.state, day: 5 + STORY_RETRY_DAYS };
    const won = play(later, fixtureStoryRule("live-specimen"), "won");
    expect(won.state.progress.storyRetryDay).toBeUndefined();
    expect(won.state.progress.storyWon).toEqual(["live-specimen"]);
  });
});

// ===========================================
// The spine
// ===========================================

describe("the spine", () => {
  it("wins the campaign when the next act does not exist yet", () => {
    // Only Live Specimen is built, so Act II has no ending: its win is
    // the last thing the story holds.
    const won = play(flagged([]), LIVE_SPECIMEN, "won");
    expect(won.state.progress.act).toBe("act-1");
    expect(won.state.progress.flags).toEqual(["campaign-won"]);
    expect(won.state.hives).toEqual([]);
    expect(won.events.map((event) => event.type)).toEqual([CAMPAIGN_FLAG_SET]);
    expect(evaluateOutcome(campaignOf(won.state))).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("moves into Act II when it exists, scripting the first hive in the worst region", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN, INTACT_POD);
    const won = play(flagged([]), LIVE_SPECIMEN, "won", rules);
    expect(won.state.progress).toMatchObject({
      act: "act-2",
      actStartedAt: 4,
      storyWon: ["live-specimen"],
    });
    expect(won.state.progress.flags).toEqual([]);
    // East (mid 50, full 100) is worse than west (clean 0, low 10).
    expect(won.state.hives).toEqual([
      expect.objectContaining({ regionId: "east", formedDay: 5 }),
    ]);
    expect(won.events.map((event) => event.type)).toEqual([
      ACT_ADVANCED,
      HIVE_FORMED,
    ]);
    expect(won.events[0]?.payload).toEqual({ from: "act-1", to: "act-2" });
    expect(evaluateOutcome(campaignOf(won.state))).toBeUndefined();
  });

  it("forms no hive entering an act the spine does not script one for", () => {
    const launch = fixtureStoryRule("launch-window", {
      act: "act-3",
      onWon: ADVANCE,
    });
    const rules = storyRulesOf(LIVE_SPECIMEN, INTACT_POD, launch);
    const won = play(flagged([], {}, "act-2"), INTACT_POD, "won", rules);
    expect(won.state.progress.act).toBe("act-3");
    expect(won.state.hives).toEqual([]);
    expect(won.events.map((event) => event.type)).toEqual([ACT_ADVANCED]);
  });

  it("wins the campaign on advance-act from the finale and on a victory effect", () => {
    const state = flagged([], {}, "finale");
    const ctx = storyContext(storyRulesOf(SPORE_PLATFORM));
    for (const effects of [ADVANCE, [{ kind: "victory" }]] as const) {
      const applied = applyStoryEffects(state, effects, ctx);
      expect(applied.state.progress.flags).toEqual(["campaign-won"]);
      expect(applied.state.progress.act).toBe("finale");
    }
  });

  it("says an act exists only when its ending and every earlier act's are built", () => {
    const exists = (...rules: readonly StoryMissionRule[]) => {
      const deps = { rules: storyRulesOf(...rules), spine: STORY_SPINE };
      return ACT_IDS.filter((act) => actExists(act, deps));
    };
    expect(exists()).toEqual([]);
    expect(exists(LIVE_SPECIMEN)).toEqual(["act-1"]);
    expect(exists(LIVE_SPECIMEN, INTACT_POD)).toEqual(["act-1", "act-2"]);
    // A gap ends the run: Act III's ending is built, Act II's is not.
    expect(exists(LIVE_SPECIMEN, LAUNCH_WINDOW)).toEqual(["act-1"]);
    expect(exists(INTACT_POD, LAUNCH_WINDOW, SPORE_PLATFORM)).toEqual([]);
    expect(
      exists(LIVE_SPECIMEN, INTACT_POD, LAUNCH_WINDOW, SPORE_PLATFORM),
    ).toEqual(["act-1", "act-2", "act-3", "finale"]);
    expect(nextActOf("act-1")).toBe("act-2");
    expect(nextActOf("act-3")).toBe("finale");
    expect(nextActOf("finale")).toBeUndefined();
  });

  it("keeps a Live Specimen win the campaign's victory while Intact Pod is unbuilt, whatever Act III holds", () => {
    // Launch Window and Uplink ship in the table; Intact Pod does not.
    const rules: StoryMissionRules = {
      ...STORY_MISSION_RULES,
      "live-specimen": LIVE_SPECIMEN,
    };
    expect(rules["launch-window"]).toBeDefined();
    expect(rules["intact-pod"]).toBeUndefined();
    const won = play(flagged([]), LIVE_SPECIMEN, "won", rules);
    expect(won.state.progress.act).toBe("act-1");
    expect(won.state.progress.flags).toEqual(["campaign-won"]);
    expect(won.events.map((event) => event.type)).toEqual([CAMPAIGN_FLAG_SET]);
    expect(evaluateOutcome(campaignOf(won.state))).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("never enters an act through a gap: Act III needs Act I's ending too", () => {
    // A campaign already in Act II (a debug start) with Act II's and
    // Act III's endings built but not Act I's: Act III does not exist,
    // so the Intact Pod win is the last thing the story holds.
    const rules = storyRulesOf(INTACT_POD, LAUNCH_WINDOW);
    const won = play(flagged([], {}, "act-2"), INTACT_POD, "won", rules);
    expect(won.state.progress.act).toBe("act-2");
    expect(won.state.progress.flags).toEqual(["campaign-won"]);
  });

  it("enters Act III from Act II once every act up to it is built", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN, INTACT_POD, LAUNCH_WINDOW);
    const won = play(flagged([], {}, "act-2"), INTACT_POD, "won", rules);
    expect(won.state.progress).toMatchObject({ act: "act-3", flags: [] });
    expect(evaluateOutcome(campaignOf(won.state))).toBeUndefined();
  });

  it("is deterministic: the same win on the same state gives the same campaign", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN, INTACT_POD);
    const a = play(flagged([]), LIVE_SPECIMEN, "won", rules);
    const b = play(flagged([]), LIVE_SPECIMEN, "won", rules);
    expect(a).toEqual(b);
  });
});

// ===========================================
// D7: the platform
// ===========================================

describe("the Spore Platform's loss rule (arc D7)", () => {
  const finale = (flags: readonly CampaignFlagId[]): OverworldState =>
    flagged(flags, {}, "finale");

  it("adds +30 to every city, capped at 100, and sets platform-failed on the first loss", () => {
    const lost = play(finale(["last-hope"]), SPORE_PLATFORM, "lost");
    const level = (id: string): number =>
      getCity(lost.state.map, id).infestation;
    expect([level("clean"), level("low"), level("mid"), level("full")]).toEqual(
      [30, 40, 80, 100],
    );
    expect(lost.state.progress.flags).toEqual(["last-hope", "platform-failed"]);
    // "full" was already at 100, so three cities moved.
    expect(lost.events.map((event) => event.type)).toEqual([
      CITY_INFESTATION_CHANGED,
      CITY_INFESTATION_CHANGED,
      CITY_INFESTATION_CHANGED,
      CAMPAIGN_FLAG_SET,
    ]);
    expect(evaluateOutcome(campaignOf(lost.state))).toBeUndefined();
  });

  it("is not pinned again after the first loss until Last Hope is researched", () => {
    const failed = play(finale(["last-hope"]), SPORE_PLATFORM, "lost").state;
    // Last Hope reveals itself only after the failure (requiresFlags:
    // platform-failed), so a fresh failure has no last-hope yet.
    const withoutHope: OverworldState = {
      ...failed,
      progress: { ...failed.progress, flags: ["platform-failed"] },
    };
    expect(isStoryPinnable(SPORE_PLATFORM, withoutHope)).toBe(false);
    expect(isStoryPinnable(SPORE_PLATFORM, failed)).toBe(true);
  });

  it("ends the campaign in defeat on the second loss", () => {
    const again = finale(["last-hope", "platform-failed"]);
    const failed = play(again, SPORE_PLATFORM, "lost");
    expect(failed.state.progress.flags).toEqual([
      "last-hope",
      "platform-failed",
      "campaign-lost",
    ]);
    // No second +30: the campaign is over.
    expect(failed.state.map).toBe(again.map);
    expect(failed.events).toEqual([
      { type: CAMPAIGN_FLAG_SET, payload: { flag: "campaign-lost" } },
    ]);
    expect(evaluateOutcome(campaignOf(failed.state))).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
  });
});

// ===========================================
// Pinning
// ===========================================

describe("isStoryPinnable", () => {
  const rule = fixtureStoryRule("live-specimen", { pinWhen: ["capture-net"] });

  it("pins in the rule's act once every pinWhen flag is set", () => {
    expect(isStoryPinnable(rule, flagged(["capture-net"]))).toBe(true);
    expect(isStoryPinnable(rule, flagged([]))).toBe(false);
    expect(isStoryPinnable(rule, flagged(["capture-net"], {}, "act-2"))).toBe(
      false,
    );
  });

  it("does not pin a mission already on the board or already won", () => {
    const state = flagged(["capture-net"]);
    const onBoard = { ...state, missions: [offerOf(rule, state)] };
    expect(isStoryPinnable(rule, onBoard)).toBe(false);
    const won: OverworldState = {
      ...state,
      progress: { ...state.progress, storyWon: ["live-specimen"] },
    };
    expect(isStoryPinnable(rule, won)).toBe(false);
  });
});
