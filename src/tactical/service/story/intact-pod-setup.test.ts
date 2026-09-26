import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { INTACT_POD_TUNING } from "../../data/intact-pod-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import { CRASH_SITE_SETUP } from "../missions/crash-site-setup";
import { decidingObjectives } from "../objectives/objective-status";
import { podHp } from "../spawn-service";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { createIntactPodSetup, INTACT_POD_SOURCE_ID } from "./intact-pod-setup";
import { STORY_SETUP_RULES } from "./story-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** Where the crater's spore-pod hook stands. */
const POD_TILE = { x: 5, y: 0, z: 4 };

/** Intact Pod's offer, as the director makes it: a d6 crash site. */
const INTACT_POD: Mission = {
  id: "mission-1",
  typeId: "crash-site",
  storyId: "intact-pod",
  cityId: "city-1",
  difficulty: 6,
  mapParams: {
    biome: "temperate",
    settlement: "rural",
    size: "small",
    seed: "intact-pod-setup",
  },
  rewards: { credits: 900, techPoints: 60 },
  createdDay: 1,
  expiresDay: 1,
  ignorePenalty: 15,
  pinned: true,
  act: "act-2",
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

/** A field with one spore-pod hook, or none. */
function crater(withPod = true): TacticalMap {
  const builder = openField();
  if (withPod) {
    builder.objective(HookKinds.SPORE_POD, [POD_TILE], PassMask.ALL);
  }
  return builder.build();
}

/** Setup deps over fresh ids and the shipped tunings. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
  };
}

/** The crash site's setup and then Intact Pod's on `map`, one id stream. */
function setUp(map: TacticalMap = crater()) {
  const setupDeps = deps();
  const state = missionWith(
    map,
    [unitAt("u", "infantry", { x: 0, y: 0, z: 0 })],
    {
      difficulty: INTACT_POD.difficulty,
    },
  );
  const typed = CRASH_SITE_SETUP.setup(state, map, INTACT_POD, setupDeps);
  if (!typed.ok) throw new Error(typed.error.kind);
  return {
    typed: typed.value,
    story: createIntactPodSetup(INTACT_POD_TUNING).setup(
      typed.value,
      map,
      INTACT_POD,
      setupDeps,
    ),
  };
}

/** The mission `setUp` returned, or a thrown error. */
function setUpOk(map?: TacticalMap): TacticalState {
  const { story } = setUp(map);
  if (!story.ok) throw new Error(story.error.kind);
  return story.value;
}

// ===========================================
// Tests
// ===========================================

describe("createIntactPodSetup (campaign arc §6.9, #1179)", () => {
  it("is Intact Pod's entry in the shipped story table, over the shipped tuning", () => {
    expect(STORY_SETUP_RULES["intact-pod"]?.storyId).toBe("intact-pod");
    expect(INTACT_POD_TUNING.recoveryTurn).toBe(8);
    expect(INTACT_POD_TUNING.extraWaves).toBe(1);
    // The shipped rule and a fresh one over the shipped tuning agree.
    const map = crater();
    const { typed } = setUp(map);
    const shipped = STORY_SETUP_RULES["intact-pod"]?.setup(
      typed,
      map,
      INTACT_POD,
      { ...deps(), ids: new SequentialIdGenerator() },
    );
    const fresh = createIntactPodSetup(INTACT_POD_TUNING).setup(
      typed,
      map,
      INTACT_POD,
      { ...deps(), ids: new SequentialIdGenerator() },
    );
    expect(shipped).toEqual(fresh);
  });

  it("replaces the pod to burn with a pod to keep, under the same objective id", () => {
    const { typed } = setUp();
    expect(typed.objectives.map((o) => o.kind)).toEqual(["destroy-pod"]);
    const mission = setUpOk();
    const pod = mission.units.find((unit) => unit.kind === "generator");
    expect(pod).toBeDefined();
    if (pod === undefined) return;
    expect(mission.objectives).toEqual([
      {
        id: typed.objectives[0]?.id,
        kind: "recover-pod",
        targetId: pod.id,
        complete: false,
        failed: false,
        deadlineTurn: 8,
        huntedAt: POD_TILE,
      },
    ]);
    // The recovery decides the mission, as the burn did.
    expect(decidingObjectives(mission.objectives).map((o) => o.kind)).toEqual([
      "recover-pod",
    ]);
  });

  it("takes the spore-pod spawner away: nothing to burn, nothing to mature", () => {
    const { typed } = setUp();
    expect(typed.spawners.map((s) => s.variant)).toEqual(["spore-pod"]);
    expect(setUpOk().spawners).toEqual([]);
  });

  it("stands the pod as a generator-kind unit of ours on the hook, with the crash site's d6 hit points", () => {
    const mission = setUpOk();
    const pods = mission.units.filter((unit) => unit.kind === "generator");
    expect(pods).toHaveLength(1);
    const [pod] = pods;
    if (pod === undefined) return;
    const hp = podHp(6, SPAWN_TUNING);
    expect(hp).toBe(65);
    expect(pod).toMatchObject({
      team: "tdf",
      sourceId: INTACT_POD_SOURCE_ID,
      templateId: "generator:spore-pod",
      pos: POD_TILE,
      hp,
      maxHp: hp,
      ap: 0,
    });
    expect(mission.templates["generator:spore-pod"]).toMatchObject({
      name: "Spore pod",
      maxHp: hp,
      move: 0,
      weapons: [],
      armor: 1,
      sightRange: 3,
      modelId: "bug.spore-pod",
      // A medkit mends it; a defence's generator is mechanical.
      construction: "organic",
    });
    // A defence's generator template is not touched.
    expect(mission.templates["generator:generator"]).toBeUndefined();
  });

  it("lets the edges send one wave past the crash site's two before the drop", () => {
    const { typed } = setUp();
    expect(typed.edgeSpawn.totalWaves).toBe(SPAWN_TUNING.podEdgeWaves);
    expect(setUpOk().edgeSpawn).toEqual({
      ...typed.edgeSpawn,
      totalWaves: SPAWN_TUNING.podEdgeWaves + INTACT_POD_TUNING.extraWaves,
    });
    expect(setUpOk().edgeSpawn.totalWaves).toBe(3);
  });

  it("reads the crash site's waves off the tuning when the setup left them unset", () => {
    const { typed } = setUp();
    const { totalWaves: _unset, ...edgeSpawn } = typed.edgeSpawn;
    const applied = createIntactPodSetup(INTACT_POD_TUNING).setup(
      { ...typed, edgeSpawn },
      crater(),
      INTACT_POD,
      deps(),
    );
    if (!applied.ok) throw new Error(applied.error.kind);
    expect(applied.value.edgeSpawn.totalWaves).toBe(3);
  });

  it("refuses a crater with no spore pod to recover", () => {
    const { story } = setUp(crater(false));
    expect(story.ok).toBe(false);
    if (story.ok) return;
    expect(story.error).toEqual({
      kind: "map-recipe",
      reason: "Intact Pod has no spore pod to recover",
    });
  });
});
