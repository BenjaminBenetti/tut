import { describe, expect, it } from "vitest";

import { SOVEREIGN_TUNING } from "../../bugs/data/sovereign-tuning";
import { isSovereign, sovereignHp } from "../../bugs/service/sovereign-service";
import { HookKinds } from "../../mapgen/model/hook";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { advanceDay } from "../../overworld/model/advance-day-command";
import type { Mission } from "../../overworld/model/mission";
import type { StoryMissionRules } from "../../overworld/model/story-mission-rule";
import { fixtureStoryRule } from "../../overworld/service/story/story-fixtures.test-helper";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { GameState } from "../../save/model/game-state";
import { MemoryKeyValueStore } from "../../save/repository/memory-key-value-store";
import { PLATFORM_ASSAULT_TUNING } from "../../tactical/data/platform-assault-tuning";
import { advanceStage } from "../../tactical/model/advance-stage-command";
import { extract } from "../../tactical/model/extract-command";
import { startMission } from "../../tactical/model/start-mission-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import {
  spawnerCovers,
  unitFootprintTiles,
} from "../../tactical/service/footprint-service";
import { withEscortShare } from "../../tactical/service/missions/escort-share";
import { spawnerMiddleTile } from "../../tactical/service/objectives/wreck-objectives";
import type { GameComposition } from "./game-composition";
import { composeGame } from "./game-composition";
import { PLATFORM_CORE_BOSS } from "./platform-core-boss";

// ===========================================
// Fixtures
// ===========================================

const NOW = "2026-09-26T00:00:00.000Z";

/**
 * The shipped story with Act II's ending as a fixture (Intact Pod is
 * unbuilt), so the finale exists and the shipped platform is pinned.
 */
const WHOLE_SPINE: StoryMissionRules = {
  ...STORY_MISSION_RULES,
  "intact-pod": fixtureStoryRule("intact-pod", {
    act: "act-2",
    onWon: [{ kind: "advance-act" }],
  }),
};

/** The shipped game over memory storage, with the whole spine. */
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

/**
 * A finale campaign with the platform pinned, its hull won by walking
 * the whole force out through the hatch, and the core stage opened:
 * the offer and the core chamber as the composition root built it.
 */
function coreStage(game: GameComposition): {
  readonly offer: Mission;
  readonly core: TacticalState;
} {
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
  const offer = live(game).overworld.missions.find(
    (mission) => mission.storyId === "spore-platform",
  );
  if (offer === undefined) throw new Error("the platform must pin");
  const { roster } = live(game);
  run(
    game,
    startMission(offer.id, {
      missionId: offer.id,
      squadIds: roster.squads.map((squad) => squad.id),
      mechIds: roster.mechs.map((mech) => mech.id),
    }),
  );
  // Past the hull the cheap way: every unit onto the hatch, then out.
  const hull = active(game);
  const force = hull.units.filter((unit) => unit.team === "tdf");
  game.session.replace({
    ...live(game),
    activeMission: {
      ...hull,
      units: hull.units.map((unit, index) =>
        unit.team === "tdf"
          ? { ...unit, pos: hull.extraction[index] ?? unit.pos, ap: unit.maxAp }
          : unit,
      ),
    },
  });
  for (const unit of force) run(game, extract(unit.id));
  run(game, advanceStage(offer.id));
  return { offer, core: active(game) };
}

// ===========================================
// The Sovereign on the core stage
// ===========================================

describe("PLATFORM_CORE_BOSS: the Sovereign guards the platform core (#1179, arc §6.9, §9)", () => {
  it("is the Sovereign, with her summons' species as her escort", () => {
    expect(PLATFORM_CORE_BOSS?.species.id).toBe("sovereign");
    expect(PLATFORM_CORE_BOSS?.escort).toEqual(SOVEREIGN_TUNING.summon.escort);
  });

  it("starts the finale's core stage with her on the dais, guarding the platform core, at the mission's difficulty", () => {
    const game = build();
    const { offer, core } = coreStage(game);
    expect(core.map.recipe.params.archetype).toBe("spore-platform-core");

    const sovereigns = core.units.filter(isSovereign);
    expect(sovereigns).toHaveLength(1);
    const [her] = sovereigns;
    if (her === undefined) throw new Error("she stands");

    // On the dais: her 4×4 block is exactly the dais's tiles.
    const dais = core.map.hooks.objectives.find(
      (hook) => hook.kind === HookKinds.SOVEREIGN_DAIS,
    );
    if (dais === undefined) throw new Error("the core chamber has a dais");
    const key = (tile: { x: number; z: number }): string =>
      `${String(tile.x)},${String(tile.z)}`;
    expect(unitFootprintTiles(core, her).map(key).sort()).toEqual(
      dais.tiles.map(key).sort(),
    );

    // Guarding the platform core: the middle tile of its 3×3.
    const heart = core.spawners.find(
      (spawner) => spawner.variant === "platform-core",
    );
    if (heart === undefined) throw new Error("the platform core stands");
    expect(her.core).toEqual(spawnerMiddleTile(heart));
    expect(her.core !== undefined && spawnerCovers(heart, her.core)).toBe(true);

    // Hit points for the mission's difficulty, named and persona-driven.
    expect(offer.difficulty).toBe(10);
    expect(her.hp).toBe(sovereignHp(offer.difficulty));
    expect(her.maxHp).toBe(sovereignHp(offer.difficulty));
    expect(her.persona).toBe("sovereign");

    // Her escort takes its share of the core's waves.
    expect(core.bugMix).toEqual(
      withEscortShare(
        offer.bugMix,
        SOVEREIGN_TUNING.summon.escort,
        PLATFORM_ASSAULT_TUNING.escortShare,
      ),
    );
  });
});
