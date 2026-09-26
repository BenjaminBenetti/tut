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
import type { CampaignState } from "../../model/campaign-state";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import { MISSION_EXPIRED } from "../../model/mission-expired-event";
import { MISSION_OFFERED } from "../../model/mission-offered-event";
import type { MissionOutcome } from "../../model/mission-result";
import { MISSION_WITHDRAWN } from "../../model/mission-withdrawn-event";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { STORY_RETRY_DAYS } from "../../model/story-mission-rule";
import { generateMissions } from "../mission-generation-service";
import { MISSION_CONSEQUENCE_RULES } from "../missions/mission-consequence-rules";
import {
  fixtureState,
  missionAt,
  progressIn,
  resultFor,
} from "../missions/mission-fixtures.test-helper";
import { MISSION_OFFER_RULES } from "../missions/mission-offer-rules";
import { evaluateOutcome } from "../outcome-service";
import { onStoryMissionResolved } from "../story-service";
import {
  LAUNCH_WINDOW,
  LAUNCH_WINDOW_DIFFICULTY,
  LAUNCH_WINDOW_WAVES,
} from "./launch-window";
import { fixtureStoryRule, pinContext } from "./story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import { createStoryPinTrigger } from "./story-pin-trigger";

// ===========================================
// Fixtures
// ===========================================

/** The fixture overworld in Act III on `day`, with `flags` set. */
function campaign(flags: readonly CampaignFlagId[], day = 5): OverworldState {
  return fixtureState({
    day,
    progress: { ...progressIn("act-3", 0), flags },
  });
}

/** Both of Launch Window's pin flags. */
const GATE: readonly CampaignFlagId[] = [
  "platform-approach",
  "great-hives-destroyed",
];

/** The shipped director's day for `state`, with the shipped story table. */
function direct(state: OverworldState, seed = 1): OverworldState {
  return directed(state, seed).state;
}

/** The shipped director's day for `state` and its events. */
function directed(state: OverworldState, seed = 1) {
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

/** Launch Window's offer on the board of `state`, if pinned. */
function launchWindow(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "launch-window");
}

/** Launch Window's offer on `state`, built directly. */
function offerOn(state: OverworldState): Mission {
  const offer = LAUNCH_WINDOW.create(state, pinContext(1));
  if (offer === undefined) {
    throw new Error("Launch Window must find a site");
  }
  return offer;
}

/** Plays Launch Window on `state` to `outcome` against `rules`. */
function play(
  state: OverworldState,
  outcome: MissionOutcome,
  rules: StoryMissionRules = STORY_MISSION_RULES,
): OverworldApplied<OverworldState> {
  const offer = offerOn(state);
  return onStoryMissionResolved(state, offer, resultFor(offer, outcome, 0), {
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

/** Acts I and II's endings as fixtures, so Act III exists. */
const EARLIER_ACTS: StoryMissionRules = {
  "live-specimen": fixtureStoryRule("live-specimen", {
    onWon: [{ kind: "advance-act" }],
  }),
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
};

// ===========================================
// The rule
// ===========================================

describe("LAUNCH_WINDOW", () => {
  it("ends Act III: pinned on both gate flags, advance-act on a win, slips five days on a loss (arc §3, §4, §6.9)", () => {
    expect(STORY_MISSION_RULES["launch-window"]).toBe(LAUNCH_WINDOW);
    expect(STORY_SPINE["act-3"].endedBy).toBe("launch-window");
    expect(LAUNCH_WINDOW).toMatchObject({
      id: "launch-window",
      act: "act-3",
      pinWhen: GATE,
      onWon: [{ kind: "advance-act" }],
      onLost: { kind: "retry", delayDays: STORY_RETRY_DAYS },
    });
    expect(LAUNCH_WINDOW_DIFFICULTY).toBe(8);
    expect(LAUNCH_WINDOW_WAVES).toBe(7);
  });

  it("offers a pinned d8 defence of the launch site that never expires", () => {
    const offer = offerOn(campaign(GATE));
    expect(offer).toMatchObject({
      typeId: "defend-installation",
      storyId: "launch-window",
      pinned: true,
      difficulty: 8,
      act: "act-3",
      defence: { installation: "launch-site", generators: 4, waves: 7 },
    });
    expect(isMissionExpired(offer, offer.expiresDay + 1000)).toBe(false);
  });
});

// ===========================================
// On the board
// ===========================================

describe("Launch Window on the board", () => {
  it("is pinned only once both platform-approach and great-hives-destroyed are set", () => {
    expect(launchWindow(direct(campaign([])))).toBeUndefined();
    expect(
      launchWindow(direct(campaign(["platform-approach"]))),
    ).toBeUndefined();
    expect(
      launchWindow(direct(campaign(["great-hives-destroyed"]))),
    ).toBeUndefined();
    expect(launchWindow(direct(campaign(GATE)))?.storyId).toBe("launch-window");
  });

  it("is pinned the day its gate opens with no city free, withdrawing an ordinary offer and never the Defend Installation (#1179)", () => {
    // Uplink is won, so Launch Window alone pins. Every city holds an
    // offer: low's, the quietest, is a triggered Defend Installation and
    // full's is pinned, so the quietest ordinary one is mid's.
    const gated = campaign(GATE);
    const before: OverworldState = {
      ...gated,
      progress: { ...gated.progress, storyWon: ["uplink"] },
      missions: [
        missionAt("clean", 30),
        missionAt("low", 30, 10, "defend-installation"),
        missionAt("mid", 30),
        { ...missionAt("full", 30), pinned: true },
      ],
    };
    const { state, events } = directed(before);
    const offer = launchWindow(state);
    expect(offer).toMatchObject({ pinned: true, cityId: "mid" });
    expect(state.missions.map((mission) => mission.id)).not.toContain(
      "mission-mid",
    );
    for (const kept of [0, 1, 3]) {
      expect(state.missions).toContain(before.missions[kept]);
    }
    expect(events.slice(0, 2)).toEqual([
      {
        type: MISSION_WITHDRAWN,
        payload: {
          missionId: "mission-mid",
          typeId: "infestation-clearance",
          cityId: "mid",
          replacedBy: offer?.id,
        },
      },
      { type: MISSION_OFFERED, payload: { mission: offer } },
    ]);
    expect(
      events.filter((event) => event.type === MISSION_WITHDRAWN),
    ).toHaveLength(1);
    expect(events.map((event) => event.type)).not.toContain(MISSION_EXPIRED);
  });

  it("slips five days on a loss, then is pinned again; the campaign goes on", () => {
    const lost = play(campaign(GATE, 10), "lost").state;
    expect(lost.progress.storyRetryDay).toEqual({
      "launch-window": 10 + STORY_RETRY_DAYS,
    });
    expect(evaluateOutcome(campaignOf(lost))).toBeUndefined();
    const on = (day: number) => launchWindow(direct({ ...lost, day }));
    expect(on(10)).toBeUndefined();
    expect(on(10 + STORY_RETRY_DAYS - 1)).toBeUndefined();
    expect(on(10 + STORY_RETRY_DAYS)?.storyId).toBe("launch-window");
  });
});

// ===========================================
// The launch
// ===========================================

describe("a Launch Window win", () => {
  it("is the campaign's victory today, with the Spore Platform unbuilt", () => {
    for (const rules of [
      STORY_MISSION_RULES,
      { ...STORY_MISSION_RULES, ...EARLIER_ACTS },
    ]) {
      const won = play(campaign(GATE), "won", rules).state;
      expect(won.progress.act).toBe("act-3");
      expect(won.progress.flags).toEqual([...GATE, "campaign-won"]);
      expect(evaluateOutcome(campaignOf(won))).toMatchObject({
        kind: "victory",
        cause: "story",
      });
    }
  });

  it("enters the finale once the Spore Platform is built", () => {
    const rules: StoryMissionRules = {
      ...STORY_MISSION_RULES,
      ...EARLIER_ACTS,
      "spore-platform": fixtureStoryRule("spore-platform", {
        act: "finale",
        onWon: [{ kind: "victory" }],
      }),
    };
    const won = play(campaign(GATE), "won", rules);
    expect(won.state.progress).toMatchObject({
      act: "finale",
      flags: GATE,
      storyWon: ["launch-window"],
    });
    expect(won.events.map((event) => event.type)).toEqual([ACT_ADVANCED]);
    expect(won.events[0]?.payload).toEqual({ from: "act-3", to: "finale" });
    expect(evaluateOutcome(campaignOf(won.state))).toBeUndefined();
  });
});
