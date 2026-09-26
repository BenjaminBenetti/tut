import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { HIVE_TUNING } from "../../data/hive-tuning";
import { MISSION_TUNING } from "../../data/mission-tuning";
import { STORY_SPINE } from "../../data/story-spine";
import type { CampaignState } from "../../model/campaign-state";
import type { Mission } from "../../model/mission";
import { isMissionExpired } from "../../model/mission";
import type { MissionOutcome } from "../../model/mission-result";
import { MISSION_WITHDRAWN } from "../../model/mission-withdrawn-event";
import type { OverworldState } from "../../model/overworld-state";
import type { StoryMissionRules } from "../../model/story-mission-rule";
import { PLATFORM_FAILURE_INFESTATION } from "../../model/story-mission-rule";
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
import { actExists, onStoryMissionResolved } from "../story-service";
import { storyDefenceCity } from "./story-defence-offer";
import { SPORE_PLATFORM, SPORE_PLATFORM_DIFFICULTY } from "./spore-platform";
import { fixtureStoryRule, pinContext } from "./story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "./story-mission-rules";
import { createStoryPinTrigger } from "./story-pin-trigger";

// ===========================================
// Fixtures
// ===========================================

/** Acts I and II's endings as fixtures, so the finale exists whatever the shipped endings become. */
const EARLIER_ACTS: StoryMissionRules = {
  "live-specimen": fixtureStoryRule("live-specimen", {
    onWon: [{ kind: "advance-act" }],
  }),
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
};

/** The shipped story with the earlier acts filled in: the whole spine exists. */
const WHOLE_SPINE: StoryMissionRules = {
  ...STORY_MISSION_RULES,
  ...EARLIER_ACTS,
};

/** The fixture overworld in `act` on `day`, with `flags` set. */
function campaign(
  flags: readonly CampaignFlagId[] = [],
  day = 5,
  act: OverworldState["progress"]["act"] = "finale",
): OverworldState {
  return fixtureState({ day, progress: { ...progressIn(act, 0), flags } });
}

/** The shipped director's day for `state`, pinning from `rules`. */
function directed(
  state: OverworldState,
  rules: StoryMissionRules = STORY_MISSION_RULES,
  seed = 1,
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

/** The platform's offer on the board of `state`, if pinned. */
function platform(state: OverworldState): Mission | undefined {
  return state.missions.find((mission) => mission.storyId === "spore-platform");
}

/** The platform's offer after the director's day on `state`; throws if none. */
function pinned(state: OverworldState): {
  readonly state: OverworldState;
  readonly offer: Mission;
} {
  const next = directed(state).state;
  const offer = platform(next);
  if (offer === undefined) throw new Error("the platform must pin");
  return { state: next, offer };
}

/** `offer` resolved to `outcome` on `state`, the spine applied, the offer gone. */
function resolve(
  state: OverworldState,
  offer: Mission,
  outcome: MissionOutcome,
  rules: StoryMissionRules = STORY_MISSION_RULES,
): OverworldState {
  const played: OverworldState = {
    ...state,
    missions: state.missions.filter((mission) => mission.id !== offer.id),
  };
  return onStoryMissionResolved(played, offer, resultFor(offer, outcome, 0), {
    rules,
    spine: STORY_SPINE,
    ids: new SequentialIdGenerator(),
  }).state;
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

/** Every city's infestation, in map order. */
function infestations(state: OverworldState): readonly number[] {
  return state.map.cities.map((city) => city.infestation);
}

// ===========================================
// The rule
// ===========================================

describe("SPORE_PLATFORM", () => {
  it("ends the finale: pinned on entering it, victory on a win, D7 on a loss (arc §3, §6.9)", () => {
    expect(STORY_MISSION_RULES["spore-platform"]).toBe(SPORE_PLATFORM);
    expect(STORY_SPINE.finale.endedBy).toBe("spore-platform");
    expect(SPORE_PLATFORM).toMatchObject({
      id: "spore-platform",
      act: "finale",
      pinWhen: [],
      onWon: [{ kind: "victory" }],
      onLost: { kind: "platform", cityInfestation: 30 },
    });
    expect(PLATFORM_FAILURE_INFESTATION).toBe(30);
    expect(SPORE_PLATFORM_DIFFICULTY).toBe(10);
  });

  it("offers a pinned d10 platform assault from the quietest ground, paying nothing, that never expires", () => {
    const state = campaign();
    const offer = SPORE_PLATFORM.create(state, pinContext(1));
    expect(offer).toMatchObject({
      typeId: "spore-platform",
      storyId: "spore-platform",
      pinned: true,
      difficulty: 10,
      act: "finale",
      rewards: { credits: 0, techPoints: 0 },
    });
    expect(offer?.cityId).toBe(storyDefenceCity(state, pinContext(1))?.id);
    expect(offer?.cityId).toBe("low");
    if (offer === undefined) return;
    expect(isMissionExpired(offer, offer.expiresDay + 1000)).toBe(false);
  });
});

// ===========================================
// On the board
// ===========================================

describe("the Spore Platform on the board", () => {
  it("is pinned the first day of the finale, and in no other act", () => {
    expect(platform(directed(campaign()).state)?.pinned).toBe(true);
    expect(platform(directed(campaign([], 5, "act-3")).state)).toBeUndefined();
  });

  it("ignores the cap: with every city holding an offer it withdraws an ordinary one to pin", () => {
    const before: OverworldState = {
      ...campaign(),
      missions: [
        missionAt("clean", 30),
        missionAt("low", 30),
        missionAt("mid", 30),
        missionAt("full", 30),
      ],
    };
    const { state, events } = directed(before);
    const offer = platform(state);
    expect(offer).toMatchObject({ pinned: true, cityId: "low" });
    expect(
      events.filter((event) => event.type === MISSION_WITHDRAWN),
    ).toHaveLength(1);
  });

  it("stays on the board however many days go by", () => {
    const { state, offer } = pinned(campaign());
    const later = directed({ ...state, day: state.day + 60 }).state;
    expect(platform(later)).toEqual(offer);
  });
});

// ===========================================
// The whole path (arc D1, D7)
// ===========================================

describe("the Spore Platform's whole path", () => {
  it("won: campaign-won, and the campaign ends in victory", () => {
    const { state, offer } = pinned(campaign());
    const won = resolve(state, offer, "won");
    expect(won.progress.flags).toEqual(["campaign-won"]);
    expect(won.progress.storyWon).toEqual(["spore-platform"]);
    expect(evaluateOutcome(campaignOf(won))).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("pin, lose (+30 everywhere, platform-failed), held back, Last Hope, re-pinned, lose again: defeat", () => {
    const first = pinned(campaign());
    const before = infestations(first.state);
    const lost = resolve(first.state, first.offer, "lost");
    expect(infestations(lost)).toEqual(
      before.map((level) =>
        Math.min(100, level + PLATFORM_FAILURE_INFESTATION),
      ),
    );
    expect(lost.progress.flags).toEqual(["platform-failed"]);
    expect(evaluateOutcome(campaignOf(lost))).toBeUndefined();

    // Held back: not pinned, however long, until Last Hope is researched.
    expect(platform(directed(lost).state)).toBeUndefined();
    expect(
      platform(directed({ ...lost, day: lost.day + 30 }).state),
    ).toBeUndefined();

    // Last Hope sets last-hope: the next day it is pinned again.
    const hope: OverworldState = {
      ...lost,
      progress: {
        ...lost.progress,
        flags: [...lost.progress.flags, "last-hope"],
      },
    };
    const second = pinned(hope);
    expect(second.offer).toMatchObject({ pinned: true, difficulty: 10 });

    // A second loss is the end: campaign-lost, defeat, no more infestation.
    const again = resolve(second.state, second.offer, "lost");
    expect(infestations(again)).toEqual(infestations(second.state));
    expect(again.progress.flags).toEqual([
      "platform-failed",
      "last-hope",
      "campaign-lost",
    ]);
    expect(evaluateOutcome(campaignOf(again))).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
  });

  it("the retry won is still victory", () => {
    const hope = campaign(["platform-failed", "last-hope"]);
    const { state, offer } = pinned(hope);
    const won = resolve(state, offer, "won");
    expect(won.progress.flags).toContain("campaign-won");
    expect(evaluateOutcome(campaignOf(won))).toMatchObject({
      kind: "victory",
    });
  });

  it("counts getting out before the core is down as a loss", () => {
    const { state, offer } = pinned(campaign());
    expect(resolve(state, offer, "extracted").progress.flags).toEqual([
      "platform-failed",
    ]);
  });
});

// ===========================================
// The spine: contiguity (arc §13)
// ===========================================

describe("the finale in the spine", () => {
  it("does not exist while Intact Pod is unbuilt: a campaign without it ends as before", () => {
    // The shipped table builds Intact Pod, so its finale exists.
    expect(
      actExists("finale", { rules: STORY_MISSION_RULES, spine: STORY_SPINE }),
    ).toBe(true);
    const { "intact-pod": _unbuilt, ...noPod } = STORY_MISSION_RULES;
    const deps = { rules: noPod, spine: STORY_SPINE };
    expect(actExists("finale", deps)).toBe(false);
    expect(actExists("act-3", deps)).toBe(false);
    // Launch Window won in Act III is still the campaign's victory.
    const gate: readonly CampaignFlagId[] = [
      "platform-approach",
      "great-hives-destroyed",
    ];
    const act3 = campaign(gate, 5, "act-3");
    const launch = noPod["launch-window"]?.create(act3, pinContext(1));
    if (launch === undefined) throw new Error("Launch Window must find a site");
    const won = resolve(act3, launch, "won", noPod);
    expect(won.progress.act).toBe("act-3");
    expect(won.progress.flags).toContain("campaign-won");
  });

  it("exists once every earlier act does: a Launch Window win enters it, and the next day pins the platform", () => {
    expect(
      actExists("finale", { rules: WHOLE_SPINE, spine: STORY_SPINE }),
    ).toBe(true);
    const gate: readonly CampaignFlagId[] = [
      "platform-approach",
      "great-hives-destroyed",
    ];
    const act3 = campaign(gate, 5, "act-3");
    const launch = WHOLE_SPINE["launch-window"]?.create(act3, pinContext(1));
    if (launch === undefined) throw new Error("Launch Window must find a site");
    const won = resolve(act3, launch, "won", WHOLE_SPINE);
    expect(won.progress.act).toBe("finale");
    expect(won.progress.flags).not.toContain("campaign-won");
    expect(evaluateOutcome(campaignOf(won))).toBeUndefined();
    const next = directed({ ...won, day: won.day + 1 }, WHOLE_SPINE).state;
    expect(platform(next)).toMatchObject({
      typeId: "spore-platform",
      pinned: true,
      act: "finale",
    });
  });
});
