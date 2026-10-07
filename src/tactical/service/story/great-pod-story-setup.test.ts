import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import type { Mission } from "../../../overworld/model/mission";
import { BROOD_TUNING } from "../../data/brood-tuning";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { CRASH_SITE_SETUP_TUNING } from "../../data/crash-site-setup-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { GREAT_POD_SETUP_TUNING } from "../../data/great-pod-setup-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { TacticalState } from "../../model/tactical-state";
import { CRASH_SITE_SETUP } from "../missions/crash-site-setup";
import { decidingObjectives } from "../objectives/objective-status";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { createGreatPodStorySetup } from "./great-pod-story-setup";
import { STORY_SETUP_RULES } from "./story-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** First Skyfall's offer, as the director makes it: a d1 crash site. */
const FIRST_SKYFALL: Mission = {
  id: "mission-1",
  typeId: "crash-site",
  storyId: "first-skyfall",
  cityId: "city-1",
  difficulty: 1,
  mapParams: {
    biome: "temperate",
    settlement: "rural",
    size: "small",
    seed: "first-skyfall-setup",
  },
  rewards: { credits: 300, techPoints: 10 },
  createdDay: 1,
  expiresDay: 1,
  ignorePenalty: 15,
  pinned: true,
  act: "act-1",
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

/** A field with the great pod's core and one chamber, and no spore pod. */
function greatPod(): TacticalMap {
  const builder = new FixtureMapBuilder(12, 12, 3 * STOREY_LAYERS).fillGround();
  builder.objective(
    HookKinds.GREAT_POD_CORE,
    [4, 5, 6].flatMap((z) => [4, 5, 6].map((x) => ({ x, y: 0, z }))),
    PassMask.NONE,
    { hatchRadius: 3 },
  );
  builder.objective(
    HookKinds.BROOD_CHAMBER,
    [{ x: 5, y: 0, z: 1 }],
    PassMask.NONE,
    {
      chamberId: "pod-north",
      role: "route",
      radius: 2,
      label: "pod's north chamber",
    },
  );
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
    crashSite: CRASH_SITE_SETUP_TUNING,
    broods: { species: Object.values(BUG_SPECIES), tuning: BROOD_TUNING },
  };
}

/** The crash site's setup on `map`, as the mission start runs it first. */
function crashSite(
  map: TacticalMap,
  setupDeps: MissionSetupDeps,
): TacticalState {
  const state = missionWith(
    map,
    [unitAt("u", "infantry", { x: 0, y: 0, z: 11 })],
    {
      difficulty: 1,
    },
  );
  const typed = CRASH_SITE_SETUP.setup(state, map, FIRST_SKYFALL, setupDeps);
  if (!typed.ok) throw new Error(typed.error.kind);
  return typed.value;
}

// ===========================================
// Tests
// ===========================================

describe("createGreatPodStorySetup (#1238)", () => {
  it("is First Skyfall's entry in the shipped story table, over the shipped tuning", () => {
    expect(STORY_SETUP_RULES["first-skyfall"]?.storyId).toBe("first-skyfall");
    const map = greatPod();
    const typed = crashSite(map, deps());
    const shipped = STORY_SETUP_RULES["first-skyfall"]?.setup(
      typed,
      map,
      FIRST_SKYFALL,
      { ...deps(), ids: new SequentialIdGenerator() },
    );
    const fresh = createGreatPodStorySetup(
      "first-skyfall",
      GREAT_POD_SETUP_TUNING,
    ).setup(typed, map, FIRST_SKYFALL, {
      ...deps(),
      ids: new SequentialIdGenerator(),
    });
    expect(shipped).toEqual(fresh);
  });

  it("turns a crash site with no spore pod into the great pod: one core to wreck by turn 12, two edge waves", () => {
    const map = greatPod();
    const setupDeps = deps();
    const typed = crashSite(map, setupDeps);
    // The crash site found no spore pod on the great pod's map.
    expect(typed.spawners).toEqual([]);
    expect(typed.objectives).toEqual([]);
    const story = createGreatPodStorySetup(
      "first-skyfall",
      GREAT_POD_SETUP_TUNING,
    ).setup(typed, map, FIRST_SKYFALL, setupDeps);
    if (!story.ok) throw new Error(story.error.kind);
    const mission = story.value;
    expect(mission.spawners.map((s) => s.variant)).toEqual(["great-pod-core"]);
    expect(decidingObjectives(mission.objectives)).toEqual([
      expect.objectContaining({
        kind: "destroy-pod",
        targetId: mission.spawners[0]?.id,
        deadlineTurn: 12,
        greatPod: true,
      }),
    ]);
    expect(mission.edgeSpawn.totalWaves).toBe(SPAWN_TUNING.podEdgeWaves);
    expect(mission.broods?.map((brood) => brood.label)).toEqual([
      "pod's north chamber",
    ]);
  });

  it("refuses a crash site without the great pod", () => {
    const map = new FixtureMapBuilder(8, 8, 3 * STOREY_LAYERS)
      .fillGround()
      .build();
    const setupDeps = deps();
    const result = createGreatPodStorySetup(
      "first-skyfall",
      GREAT_POD_SETUP_TUNING,
    ).setup(crashSite(map, setupDeps), map, FIRST_SKYFALL, setupDeps);
    expect(result.ok).toBe(false);
  });
});
