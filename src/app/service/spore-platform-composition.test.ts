import { describe, expect, it } from "vitest";

import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Mission } from "../../overworld/model/mission";
import { unlockTech } from "../../overworld/model/unlock-tech-command";
import type { StoryMissionRules } from "../../overworld/model/story-mission-rule";
import { PLATFORM_FAILURE_INFESTATION } from "../../overworld/model/story-mission-rule";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { fixtureStoryRule } from "../../overworld/service/story/story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { PLATFORM_ASSAULT_TUNING } from "../../tactical/data/platform-assault-tuning";
import { abandonMission } from "../../tactical/model/abandon-mission-command";
import { advanceStage } from "../../tactical/model/advance-stage-command";
import { extract } from "../../tactical/model/extract-command";
import { finishMission } from "../../tactical/model/finish-mission-command";
import { interact } from "../../tactical/model/interact-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

const LAST_HOPE = "tech.last-hope";

/**
 * The shipped story with fixture endings for Acts I and II (Live
 * Specimen's is shipped but Intact Pod is not), so the whole spine
 * exists and the shipped Spore Platform is reachable.
 */
const WHOLE_SPINE: StoryMissionRules = {
  ...STORY_MISSION_RULES,
  "live-specimen": fixtureStoryRule("live-specimen", {
    onWon: [{ kind: "advance-act" }],
  }),
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
};

/** The shipped game, played tactically over the whole spine, over memory storage. */
function build(): GameComposition {
  return composeGame({
    storage: new MemoryKeyValueStore(),
    clock: { now: () => NOW },
    newSeed: () => 7,
    onAutosaveFailure: (error) => {
      throw new Error(`autosave failed: ${error.kind}`);
    },
    story: { rules: WHOLE_SPINE, spine: STORY_SPINE },
  });
}

/** The campaign the session holds; throws when there is none. */
function live(game: GameComposition): GameState {
  const state = game.session.state;
  if (state === undefined) throw new Error("no campaign in the session");
  return state;
}

/** The active mission; throws when there is none. */
function active(game: GameComposition): TacticalState {
  const mission = live(game).activeMission;
  if (mission === undefined) throw new Error("no active mission");
  return mission;
}

/** Replaces the active mission with `change` of it, the cheap way past the turn engine. */
function edit(
  game: GameComposition,
  change: (mission: TacticalState) => TacticalState,
): void {
  const state = live(game);
  game.session.replace({ ...state, activeMission: change(active(game)) });
}

/** Dispatches `command`; throws on a refusal. */
function run(
  game: GameComposition,
  command: Parameters<
    NonNullable<GameComposition["session"]["store"]>["dispatch"]
  >[0],
): void {
  const done = game.session.store?.dispatch(command);
  if (!done?.ok) {
    throw new Error(`${command.type} refused: ${JSON.stringify(done)}`);
  }
}

/** A fresh campaign in the finale, the board empty, then one day: the platform pinned. */
function inFinale(game: GameComposition): Mission {
  const fresh = game.createCampaign({ seed: 7, createdAt: NOW });
  game.session.start({
    ...fresh,
    overworld: {
      ...fresh.overworld,
      missions: [],
      progress: { ...fresh.overworld.progress, act: "finale" },
    },
  });
  run(game, advanceDay());
  const offer = platform(live(game));
  if (offer === undefined) throw new Error("the platform must pin");
  return offer;
}

/** The platform's offer on the board, if any. */
function platform(state: GameState): Mission | undefined {
  return state.overworld.missions.find(
    (mission) => mission.storyId === "spore-platform",
  );
}

/** Starts `offer` with every squad and mech on the roster. */
function start(game: GameComposition, offer: Mission): void {
  const { roster } = live(game);
  run(
    game,
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: roster.squads.map((squad) => squad.id),
      mechIds: roster.mechs.map((mech) => mech.id),
    }),
  );
}

/** Every city's infestation, in map order. */
function infestations(state: GameState): readonly number[] {
  return state.overworld.map.cities.map((city) => city.infestation);
}

/** Leaves the mission and resolves it: a loss. */
function leave(game: GameComposition, offer: Mission): void {
  run(game, abandonMission());
  run(game, finishMission(offer.id));
}

// ===========================================
// Both stages, through the composition root
// ===========================================

describe("the Spore Platform through the composition root (#1179, arc §6.9)", () => {
  it("is pinned in the finale, fought through the hull and the core, and a destroyed core wins the campaign", () => {
    const game = build();
    const offer = inFinale(game);
    expect(offer).toMatchObject({
      typeId: "spore-platform",
      pinned: true,
      difficulty: 10,
      act: "finale",
    });

    // The hull: the force on the docking ring, the hatch the way out.
    start(game, offer);
    const hull = active(game);
    expect(hull.map.recipe.params.archetype).toBe("spore-platform-hull");
    expect(hull.objectives.map((o) => o.kind)).toEqual(["board-core"]);
    const force = hull.units.filter((unit) => unit.team === "tdf");
    expect(force.some((unit) => unit.kind === "turret")).toBe(false);

    // Hurt the first mech, spend some of a squad's ammunition: no repairs.
    const mech = force.find((unit) => unit.kind === "mech");
    if (mech === undefined) throw new Error("the roster fields a mech");
    edit(game, (mission) => ({
      ...mission,
      units: mission.units.map((unit, index) =>
        unit.team !== "tdf"
          ? unit
          : {
              ...unit,
              pos: mission.extraction[index] ?? unit.pos,
              ap: unit.maxAp,
              hp: unit.id === mech.id ? unit.hp - 3 : unit.hp,
            },
      ),
    }));
    const hurt = active(game).units.find((unit) => unit.id === mech.id);
    for (const unit of force) run(game, extract(unit.id));
    expect(active(game).outcome).toBe("won");
    const refused = game.session.store?.dispatch(finishMission(offer.id));
    expect(refused?.ok === false && refused.error.code).toBe("stage-pending");

    // The core: straight on, the survivors as they boarded.
    run(game, advanceStage(offer.id));
    const core = active(game);
    expect(core.map.recipe.params.archetype).toBe("spore-platform-core");
    expect(core.stage?.index).toBe(1);
    expect(core.units.find((unit) => unit.id === mech.id)?.hp).toBe(hurt?.hp);
    const target = core.objectives[0];
    expect(target?.kind).toBe("destroy-platform-core");
    expect(core.extraction).toEqual([]);
    const guards = core.units.filter(
      (unit) => core.templates[unit.templateId]?.name === "Hive Guard",
    );
    expect(guards.length).toBeGreaterThan(0);

    // A squad plants charges from beside the core's west face until it
    // falls: the mission is won on the spot.
    const squad = core.units.find((unit) => unit.kind === "squad");
    const heart = core.spawners.find((s) => s.variant === "platform-core");
    if (squad === undefined || heart === undefined || target === undefined) {
      throw new Error("no squad, core or objective");
    }
    const charges = Math.ceil(PLATFORM_ASSAULT_TUNING.coreHp / 10);
    for (let n = 0; n < charges; n++) {
      edit(game, (mission) => ({
        ...mission,
        units: mission.units.map((unit) =>
          unit.id === squad.id
            ? {
                ...unit,
                pos: { ...heart.pos, x: heart.pos.x - 1 },
                ap: unit.maxAp,
              }
            : unit,
        ),
      }));
      run(game, interact(squad.id, target.id));
    }
    expect(active(game).outcome).toBe("won");

    run(game, finishMission(offer.id));
    const after = live(game);
    expect(after.activeMission).toBeUndefined();
    expect(after.overworld.lastMissionResult).toMatchObject({
      outcome: "won",
      stages: [
        expect.objectContaining({ index: 0, outcome: "won" }),
        expect.objectContaining({ index: 1, outcome: "won" }),
      ],
    });
    expect(after.overworld.progress.flags).toContain("campaign-won");
    run(game, advanceDay());
    expect(live(game).overworld.outcome).toMatchObject({
      kind: "victory",
      cause: "story",
    });
  });

  it("lost: +30 everywhere and held back; Last Hope pins it again; lost again: defeat (arc D7)", () => {
    const game = build();
    const offer = inFinale(game);
    const before = infestations(live(game));
    const { roster } = live(game);

    start(game, offer);
    leave(game, offer);
    const lost = live(game);
    expect(lost.overworld.lastMissionResult?.outcome).not.toBe("won");
    expect(infestations(lost)).toEqual(
      before.map((level) =>
        Math.min(100, level + PLATFORM_FAILURE_INFESTATION),
      ),
    );
    expect(lost.overworld.progress.flags).toContain("platform-failed");
    run(game, advanceDay());
    expect(platform(live(game))).toBeUndefined();
    expect(live(game).overworld.outcome).toBeUndefined();

    // Last Hope, researched, puts it back on the board the next day.
    const node = game.content.tech.getNode(LAST_HOPE);
    if (node === undefined) throw new Error("the tree ships Last Hope");
    const now = live(game);
    game.session.replace({
      ...now,
      economy: { ...now.economy, techPoints: node.cost },
    });
    run(game, unlockTech(LAST_HOPE));
    run(game, advanceDay());
    const retry = platform(live(game));
    if (retry === undefined) throw new Error("Last Hope must re-pin it");
    expect(retry).toMatchObject({ pinned: true, difficulty: 10 });

    // The second loss ends the campaign. The force left behind on the
    // first attempt is replaced first: the rebuild is not the subject.
    const rebuilt = live(game);
    game.session.replace({ ...rebuilt, roster });
    const beforeSecond = infestations(live(game));
    start(game, retry);
    leave(game, retry);
    expect(infestations(live(game))).toEqual(beforeSecond);
    expect(live(game).overworld.progress.flags).toContain("campaign-lost");
    run(game, advanceDay());
    expect(live(game).overworld.outcome).toMatchObject({
      kind: "defeat",
      cause: "story",
    });
  });
});
