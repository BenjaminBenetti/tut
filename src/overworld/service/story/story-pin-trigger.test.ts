import { describe, expect, it } from "vitest";

import type { CampaignFlagId } from "../../../content/model/campaign-flag-id";
import { ACTS } from "../../data/acts";
import type { Mission } from "../../model/mission";
import type { OverworldState } from "../../model/overworld-state";
import {
  fixtureState,
  missionAt,
  offerContext,
  progressIn,
} from "../missions/mission-fixtures.test-helper";
import {
  FIXTURE_STORY_DIFFICULTY,
  FIXTURE_STORY_TYPE,
  fixtureStoryRule,
  storyRulesOf,
} from "./story-fixtures.test-helper";
import { createStoryPinTrigger } from "./story-pin-trigger";

// ===========================================
// Fixtures
// ===========================================

/** The fixture overworld in Act I with `flags` set. */
function withFlags(
  flags: readonly CampaignFlagId[],
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return fixtureState({
    progress: { ...progressIn("act-1", 2), flags },
    ...overrides,
  });
}

/** Live Specimen as the capture package will pin it: after Intel I sets `capture-net`. */
const LIVE_SPECIMEN = fixtureStoryRule("live-specimen", {
  pinWhen: ["capture-net"],
});

/** What the story trigger over `rules` pins on `state`, on `seed`, in Act I. */
function pinned(
  rules: ReturnType<typeof storyRulesOf>,
  state: OverworldState,
  seed = 11,
): readonly Mission[] {
  return createStoryPinTrigger(rules).pin(
    state,
    offerContext(seed, ACTS["act-1"]),
  );
}

// ===========================================
// Pinning
// ===========================================

describe("createStoryPinTrigger", () => {
  it("pins a rule once every pinWhen flag is set: Intel I's capture-net pins Live Specimen", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN);
    expect(pinned(rules, withFlags([]))).toEqual([]);
    const offers = pinned(rules, withFlags(["capture-net"]));
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      storyId: "live-specimen",
      pinned: true,
      act: "act-1",
      typeId: FIXTURE_STORY_TYPE,
      difficulty: FIXTURE_STORY_DIFFICULTY,
      cityId: "low",
    });
  });

  it("pins nothing for an empty table, the shipped state today", () => {
    expect(pinned({}, withFlags(["capture-net"]))).toEqual([]);
  });

  it("does not pin a story mission already on the board, won, or waiting out its delay", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN);
    const state = withFlags(["capture-net"]);
    const [offer] = pinned(rules, state);
    if (offer === undefined) throw new Error("expected a pin");
    expect(pinned(rules, { ...state, missions: [offer] })).toEqual([]);
    expect(
      pinned(rules, {
        ...state,
        progress: { ...state.progress, storyWon: ["live-specimen"] },
      }),
    ).toEqual([]);
    const delayed: OverworldState = {
      ...state,
      progress: { ...state.progress, storyRetryDay: { "live-specimen": 6 } },
    };
    expect(pinned(rules, delayed)).toEqual([]);
    expect(pinned(rules, { ...delayed, day: 6 })).toHaveLength(1);
  });

  it("pins only in the rule's own act", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN);
    const state = withFlags(["capture-net"]);
    expect(
      pinned(rules, {
        ...state,
        progress: { ...state.progress, act: "act-2" },
      }),
    ).toEqual([]);
  });

  it("asks again tomorrow when the rule finds no site today", () => {
    const rules = storyRulesOf(LIVE_SPECIMEN);
    const state = withFlags(["capture-net"], {
      missions: [
        missionAt("low", 20),
        missionAt("mid", 20),
        missionAt("full", 20),
      ],
    });
    expect(pinned(rules, state)).toEqual([]);
  });

  it("lets each rule see the offers pinned before it", () => {
    const rules = storyRulesOf(
      fixtureStoryRule("first-skyfall"),
      LIVE_SPECIMEN,
    );
    const offers = pinned(rules, withFlags(["capture-net"]));
    expect(offers.map((offer) => [offer.storyId, offer.cityId])).toEqual([
      ["first-skyfall", "low"],
      ["live-specimen", "mid"],
    ]);
    expect(new Set(offers.map((offer) => offer.id)).size).toBe(2);
  });

  it("is deterministic, and one more rule never changes what another draws", () => {
    const state = withFlags(["capture-net"]);
    const alone = pinned(storyRulesOf(LIVE_SPECIMEN), state);
    expect(pinned(storyRulesOf(LIVE_SPECIMEN), state)).toEqual(alone);
    // First Skyfall is visited first; on its own fork it leaves Live
    // Specimen's stream alone, so its map seed is the one drawn alone.
    const withEarlier = pinned(
      storyRulesOf(fixtureStoryRule("first-skyfall"), LIVE_SPECIMEN),
      state,
    );
    const specimen = withEarlier.find((m) => m.storyId === "live-specimen");
    expect(withEarlier).toHaveLength(2);
    expect(specimen?.mapParams.seed).toBe(alone[0]?.mapParams.seed);
  });

  it("rejects a rule whose offer is not pinned, names another story, or takes an occupied city", () => {
    const state = withFlags([]);
    const broken = (patch: Partial<Mission>) =>
      storyRulesOf(
        fixtureStoryRule("live-specimen", {
          create: () => ({
            ...missionAt("low", 30),
            pinned: true,
            storyId: "live-specimen",
            ...patch,
          }),
        }),
      );
    expect(() => pinned(broken({ pinned: false }), state)).toThrow(RangeError);
    expect(() => pinned(broken({ storyId: "uplink" }), state)).toThrow(
      RangeError,
    );
    expect(() =>
      pinned(broken({}), { ...state, missions: [missionAt("low", 30)] }),
    ).toThrow(/already holds an offer/);
  });
});
