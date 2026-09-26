import { describe, expect, it } from "vitest";

import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { StoryMissionRules } from "../../overworld/model/story-mission-rule";
import { PLATFORM_FAILURE_INFESTATION } from "../../overworld/model/story-mission-rule";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { fixtureStoryRule } from "../../overworld/service/story/story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { startMission } from "../../tactical/model/start-mission-command";
import { isTechNodeHidden } from "../../tech/service/tech-status-service";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

const PLATFORM_APPROACH = "tech.platform-approach";
const LAST_HOPE = "tech.last-hope";

/**
 * The shipped story with fixture endings for Acts I and II (Live
 * Specimen and Intact Pod land in other packages), so Act III exists and
 * the real spine can carry a campaign into it.
 */
const THROUGH_ACT_III: StoryMissionRules = {
  ...STORY_MISSION_RULES,
  "live-specimen": fixtureStoryRule("live-specimen", {
    onWon: [{ kind: "advance-act" }],
  }),
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
};

/** The shipped game over `rules`, auto-resolving missions, over memory storage. */
function build(rules: StoryMissionRules): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    debug: { autoResolve: true },
    story: { rules, spine: STORY_SPINE },
  });
}

/** The campaign the session holds; throws when there is none. */
function live(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** Starts a fresh campaign whose overworld is edited by `edit`. */
function startWith(
  game: GameComposition,
  edit: (state: GameState) => GameState,
): void {
  game.session.start(edit(game.createCampaign({ seed: 7, createdAt: NOW })));
}

/** The pinned offer of story mission `storyId` on the board, if any. */
function storyOffer(state: GameState, storyId: string): Mission | undefined {
  return state.overworld.missions.find((m) => m.storyId === storyId);
}

/** Turns the day; throws if the tick refuses. */
function nextDay(game: GameComposition): void {
  const advanced = game.session.store?.dispatch(advanceDay());
  if (!advanced?.ok) throw new Error("the day did not advance");
}

/**
 * Replaces the roster's mechs with `MAX_DEPLOYED_UNITS` copies of the
 * starter mech: rated about 900 together, they win a d6 at a chance past
 * 0.9999999. The auto-resolver is dice and never wins at exactly 1, so
 * the test asserts that chance before it rolls.
 */
function overwhelm(game: GameComposition): void {
  const state = live(game);
  const mech = state.roster.mechs[0];
  if (mech === undefined) throw new Error("the starter roster fields a mech");
  game.session.replace({
    ...state,
    roster: {
      ...state.roster,
      mechs: Array.from({ length: MAX_DEPLOYED_UNITS }, (_, n) => ({
        ...mech,
        id: `${mech.id}-x${String(n)}`,
      })),
    },
  });
}

/** Every mech on the roster, deployed on `offer`: a full deployment. */
function everything(state: GameState, offer: Mission): Deployment {
  return {
    missionId: offer.id,
    squadIds: [],
    mechIds: state.roster.mechs.map((m) => m.id),
  };
}

/** The auto-resolver's chance that `everything` wins `offer`. */
function winChance(game: GameComposition, offer: Mission): number {
  const state = live(game);
  const city = state.overworld.map.cities.find((c) => c.id === offer.cityId);
  if (city === undefined) throw new Error(`no city ${offer.cityId}`);
  return game.assessor.assess(offer, everything(state, offer), {
    squads: state.roster.squads,
    mechs: state.roster.mechs,
    city,
  }).winProbability;
}

/** Auto-resolves `offer` with `everything`. */
function launchAll(game: GameComposition, offer: Mission): void {
  const launched = game.session.store?.dispatch(
    launchMission(offer.id, everything(live(game), offer)),
  );
  if (!launched?.ok) {
    throw new Error(`${offer.id} did not launch: ${JSON.stringify(launched)}`);
  }
}

// ===========================================
// Act III through the composition root
// ===========================================

describe("Act III through the composition root (#1179)", () => {
  it("enters Act III on the real spine, pins Uplink, and a win reveals Platform Approach", () => {
    const game = build(THROUGH_ACT_III);
    startWith(game, (fresh) => ({
      ...fresh,
      overworld: {
        ...fresh.overworld,
        missions: [],
        progress: { ...fresh.overworld.progress, act: "act-2" },
      },
    }));
    overwhelm(game);

    // Act II's ending is pinned the first day and won: the spine opens Act III.
    nextDay(game);
    const pod = storyOffer(live(game), "intact-pod");
    if (pod === undefined) throw new Error("the fixture Intact Pod must pin");
    launchAll(game, pod);
    expect(live(game).overworld.lastMissionResult?.outcome).toBe("won");
    expect(live(game).overworld.progress.act).toBe("act-3");
    expect(storyOffer(live(game), "uplink")).toBeUndefined();

    // The next day the director pins Uplink: the tracking array, d6.
    nextDay(game);
    const uplink = storyOffer(live(game), "uplink");
    expect(uplink).toMatchObject({
      typeId: "defend-installation",
      pinned: true,
      difficulty: 6,
      act: "act-3",
      defence: { installation: "tracking-array", generators: 2, waves: 5 },
    });
    if (uplink === undefined) throw new Error("Uplink must pin in Act III");

    // Platform Approach stays hidden until Uplink is won.
    const node = game.content.tech.getNode(PLATFORM_APPROACH);
    if (node === undefined) throw new Error("the tree ships Intel III");
    expect(isTechNodeHidden(node, game.techConditionsOf(live(game)))).toBe(
      true,
    );

    expect(winChance(game, uplink)).toBeGreaterThan(0.999);
    launchAll(game, uplink);
    const after = live(game);
    expect(after.overworld.lastMissionResult?.outcome).toBe("won");
    expect(after.overworld.progress.flags).toContain("uplink-won");
    expect(after.overworld.progress.act).toBe("act-3");
    expect(after.overworld.outcome).toBeUndefined();
    expect(isTechNodeHidden(node, game.techConditionsOf(after))).toBe(false);

    // Bought, it sets half of Launch Window's gate; the other half is the
    // Great Hives package's, so Launch Window is still not pinned.
    game.session.replace({
      ...after,
      economy: { ...after.economy, techPoints: node.cost },
    });
    const bought = game.session.store?.dispatch(unlockTech(PLATFORM_APPROACH));
    expect(bought?.ok).toBe(true);
    expect(live(game).overworld.progress.flags).toContain("platform-approach");
    nextDay(game);
    expect(storyOffer(live(game), "launch-window")).toBeUndefined();
  });
});

describe("Uplink on the tactical map (#1179)", () => {
  it("stands the tracking array up in the sensor array's yard: two generators to hold, five waves", () => {
    const game = build(STORY_MISSION_RULES);
    startWith(game, (fresh) => ({
      ...fresh,
      overworld: {
        ...fresh.overworld,
        missions: [],
        progress: { ...fresh.overworld.progress, act: "act-3" },
      },
    }));
    nextDay(game);
    const uplink = storyOffer(live(game), "uplink");
    if (uplink === undefined) throw new Error("Uplink must pin in Act III");

    const squads = live(game).roster.squads.map((s) => s.id);
    const started = game.session.store?.dispatch(
      startMission(uplink.id, {
        missionId: uplink.id,
        squadIds: squads,
        mechIds: [],
      }),
    );
    expect(started?.ok).toBe(true);
    const active = live(game).activeMission;
    if (active === undefined) throw new Error("Uplink did not start");
    expect(active.map.recipe.params.site).toBe("sensor-array");
    const defend = active.objectives.find(
      (o) => o.kind === "defend-generators",
    );
    expect(defend).toMatchObject({ installation: "tracking-array" });
    expect(defend?.kind === "defend-generators" && defend.targetIds).toEqual(
      active.units
        .filter((unit) => unit.kind === "generator")
        .map((unit) => unit.id),
    );
    expect(
      active.units.filter((unit) => unit.kind === "generator"),
    ).toHaveLength(2);
    expect(active.edgeSpawn.totalWaves).toBe(5);
  });
});

// ===========================================
// Last Hope (arc D7)
// ===========================================

describe("Last Hope through the composition root (#1179, arc D7)", () => {
  it("is hidden until the platform fails, and researching it lets the platform be pinned again", () => {
    const game = build({
      ...THROUGH_ACT_III,
      "spore-platform": fixtureStoryRule("spore-platform", {
        act: "finale",
        onWon: [{ kind: "victory" }],
        onLost: {
          kind: "platform",
          cityInfestation: PLATFORM_FAILURE_INFESTATION,
        },
      }),
    });
    const node = game.content.tech.getNode(LAST_HOPE);
    if (node === undefined) throw new Error("the tree ships Last Hope");
    const inFinale =
      (flags: GameState["overworld"]["progress"]["flags"]) =>
      (fresh: GameState): GameState => ({
        ...fresh,
        economy: { ...fresh.economy, techPoints: node.cost },
        overworld: {
          ...fresh.overworld,
          missions: [],
          progress: { ...fresh.overworld.progress, act: "finale", flags },
        },
      });

    // Before the platform fails the node is hidden, and refused.
    startWith(game, inFinale([]));
    expect(isTechNodeHidden(node, game.techConditionsOf(live(game)))).toBe(
      true,
    );
    const refused = game.session.store?.dispatch(unlockTech(LAST_HOPE));
    expect(refused?.ok === false && refused.error.code).toBe("tech-hidden");

    // After the first failure the platform is held back and the node shows.
    startWith(game, inFinale(["platform-failed"]));
    nextDay(game);
    expect(storyOffer(live(game), "spore-platform")).toBeUndefined();
    expect(isTechNodeHidden(node, game.techConditionsOf(live(game)))).toBe(
      false,
    );

    // Researched, it sets last-hope, and the next day the platform is back.
    const bought = game.session.store?.dispatch(unlockTech(LAST_HOPE));
    expect(bought?.ok).toBe(true);
    expect(live(game).overworld.progress.flags).toEqual([
      "platform-failed",
      "last-hope",
    ]);
    nextDay(game);
    expect(storyOffer(live(game), "spore-platform")?.pinned).toBe(true);
  });
});
