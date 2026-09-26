import { describe, expect, it } from "vitest";

import type { StoryMissionId } from "../../content/model/story-mission-id";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { Mission } from "../../overworld/model/mission";
import type { StoryMissionRules } from "../../overworld/model/story-mission-rule";
import { PLATFORM_FAILURE_INFESTATION } from "../../overworld/model/story-mission-rule";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { fixtureStoryRule } from "../../overworld/service/story/story-fixtures.test-helper";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/**
 * Every act's gate as a fixture rule that pins at once, so the real
 * spine can carry one campaign from Act I to victory: Live Specimen,
 * Intact Pod and Launch Window advance the act, and the Spore Platform
 * wins, with D7's loss rule.
 */
const WHOLE_SPINE: StoryMissionRules = {
  "live-specimen": fixtureStoryRule("live-specimen", {
    onWon: [{ kind: "advance-act" }],
  }),
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
  "launch-window": fixtureStoryRule("launch-window", {
    act: "act-3",
    onWon: [{ kind: "advance-act" }],
  }),
  "spore-platform": fixtureStoryRule("spore-platform", {
    act: "finale",
    onWon: [{ kind: "victory" }],
    onLost: { kind: "platform", cityInfestation: PLATFORM_FAILURE_INFESTATION },
  }),
};

/** The shipped game over the whole spine, auto-resolving missions. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    debug: { autoResolve: true },
    story: { rules: WHOLE_SPINE, spine: STORY_SPINE },
  });
}

/** The campaign the session holds; throws when there is none. */
function live(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** Turns the day; throws if the tick refuses. */
function nextDay(game: GameComposition): void {
  const advanced = game.session.store?.dispatch(advanceDay());
  if (!advanced?.ok) throw new Error("the day did not advance");
}

/**
 * A fresh campaign whose roster is
 * `MAX_DEPLOYED_UNITS` copies of the starter mech: together they win a
 * d2 story offer at a chance past 0.999, which each launch asserts.
 */
function startOverwhelming(game: GameComposition): void {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  const mech = fresh.roster.mechs[0];
  if (mech === undefined) throw new Error("the starter roster fields a mech");
  game.session.start({
    ...fresh,
    roster: {
      ...fresh.roster,
      mechs: Array.from({ length: MAX_DEPLOYED_UNITS }, (_, n) => ({
        ...mech,
        id: `${mech.id}-x${String(n)}`,
        name: `${mech.name} ${String(n + 1)}`,
      })),
    },
  });
}

/** Every mech on the roster, deployed on `offer`. */
function everything(state: GameState, offer: Mission): Deployment {
  return {
    missionId: offer.id,
    squadIds: [],
    mechIds: state.roster.mechs.map((m) => m.id),
  };
}

/**
 * Clears the board, so a fixture gate always finds a free infested city
 * to pin on (early in a campaign only two or three cities are infested,
 * and the director's offers hold them).
 */
function clearBoard(game: GameComposition): void {
  const state = live(game);
  game.session.replace({
    ...state,
    overworld: { ...state.overworld, missions: [] },
  });
}

/**
 * Clears the board and turns the day, then launches and wins the
 * pinned offer of `storyId` with every mech. Returns the day it was
 * played on.
 */
function winNext(game: GameComposition, storyId: StoryMissionId): number {
  clearBoard(game);
  nextDay(game);
  const state = live(game);
  const offer = state.overworld.missions.find((m) => m.storyId === storyId);
  if (offer === undefined) throw new Error(`${storyId} must pin`);
  const city = state.overworld.map.cities.find((c) => c.id === offer.cityId);
  if (city === undefined) throw new Error(`no city ${offer.cityId}`);
  const chance = game.assessor.assess(offer, everything(state, offer), {
    squads: state.roster.squads,
    mechs: state.roster.mechs,
    city,
  }).winProbability;
  expect(chance).toBeGreaterThan(0.999);
  const launched = game.session.store?.dispatch(
    launchMission(offer.id, everything(state, offer)),
  );
  if (!launched?.ok) throw new Error(`${offer.id} did not launch`);
  expect(live(game).overworld.lastMissionResult?.outcome).toBe("won");
  return state.overworld.day;
}

// ===========================================
// Tests
// ===========================================

describe("the campaign chronicle through the composition root (#1179)", () => {
  it("records each act as the real spine enters it, and freezes the chronicle into the victory", () => {
    const game = build();
    startOverwhelming(game);

    const specimen = winNext(game, "live-specimen");
    expect(live(game).overworld.progress.chronicle?.acts).toEqual([
      { act: "act-2", day: specimen, missionsPlayed: 1 },
    ]);
    const pod = winNext(game, "intact-pod");
    const launch = winNext(game, "launch-window");
    const platform = winNext(game, "spore-platform");
    expect(live(game).overworld.progress.chronicle?.acts).toEqual([
      { act: "act-2", day: specimen, missionsPlayed: 1 },
      { act: "act-3", day: pod, missionsPlayed: 2 },
      { act: "finale", day: launch, missionsPlayed: 3 },
    ]);
    expect(live(game).overworld.outcome).toBeUndefined();

    // The next tick ends the campaign and freezes the summary.
    nextDay(game);
    const ended = live(game);
    const outcome = ended.overworld.outcome;
    expect(outcome).toMatchObject({ kind: "victory", cause: "story" });
    expect(outcome?.summary).toMatchObject({
      missionsPlayed: 4,
      missionsWon: 4,
      platformAttempts: 1,
    });
    expect(outcome?.summary.acts).toEqual([
      {
        act: "act-1",
        fromDay: 1,
        toDay: specimen,
        missionsBefore: 0,
        missions: 1,
        endedBy: "live-specimen",
      },
      {
        act: "act-2",
        fromDay: specimen,
        toDay: pod,
        missionsBefore: 1,
        missions: 1,
        endedBy: "intact-pod",
      },
      {
        act: "act-3",
        fromDay: pod,
        toDay: launch,
        missionsBefore: 2,
        missions: 1,
        endedBy: "launch-window",
      },
      {
        act: "finale",
        fromDay: launch,
        toDay: ended.overworld.day,
        missionsBefore: 3,
        missions: 1,
        endedBy: "spore-platform",
      },
    ]);
    expect(outcome?.summary.storyWins).toEqual([
      { storyId: "live-specimen", act: "act-1", day: specimen },
      { storyId: "intact-pod", act: "act-2", day: pod },
      { storyId: "launch-window", act: "act-3", day: launch },
      { storyId: "spore-platform", act: "finale", day: platform },
    ]);
    expect(outcome?.summary.squad?.map((entry) => entry.id)).toEqual([
      ...ended.roster.mechs.map((m) => m.id),
      ...ended.roster.squads.map((s) => s.id),
    ]);
  });
});
