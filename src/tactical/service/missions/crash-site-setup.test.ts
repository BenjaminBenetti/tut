import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { Mission } from "../../../overworld/model/mission";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { CRASH_SITE_SETUP } from "./crash-site-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";
import { placeSporePod } from "./spore-pod-setup";

// ===========================================
// Fixtures
// ===========================================

/** A d1 crash-site offer, as the director makes them. */
const CRASH: Mission = {
  id: "mission-1",
  typeId: "crash-site",
  cityId: "city-1",
  difficulty: 1,
  mapParams: {
    biome: "temperate",
    settlement: "rural",
    size: "small",
    seed: "crash-setup",
  },
  rewards: { credits: 300, techPoints: 17 },
  createdDay: 1,
  expiresDay: 5,
  ignorePenalty: 15,
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

/** A field with one spore-pod hook. */
function crater() {
  return openField()
    .objective(HookKinds.SPORE_POD, [{ x: 5, y: 0, z: 4 }], PassMask.ALL)
    .build();
}

/** Setup deps over fresh ids and the shipped tunings. */
function deps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
  };
}

// ===========================================
// Tests
// ===========================================

describe("CRASH_SITE_SETUP (campaign arc §6.3)", () => {
  it("is the crash site's entry in the shipped table", () => {
    expect(MISSION_SETUP_RULES["crash-site"]).toBe(CRASH_SITE_SETUP);
    expect(CRASH_SITE_SETUP.typeId).toBe("crash-site");
  });

  it("stands the pod with its destroy-pod objective due at the end of turn 8", () => {
    const map = crater();
    const state = missionWith(map, [
      unitAt("u", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const setUp = CRASH_SITE_SETUP.setup(state, map, CRASH, deps());
    if (!setUp.ok) throw new Error(setUp.error.kind);
    expect(setUp.value.spawners).toEqual([
      expect.objectContaining({
        id: "spawner-1",
        variant: "spore-pod",
        pos: { x: 5, y: 0, z: 4 },
        hp: SPAWN_TUNING.podHp,
        destroyed: false,
      }),
    ]);
    expect(setUp.value.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-pod",
        targetId: "spawner-1",
        complete: false,
        deadlineTurn: 8,
      },
    ]);
    expect(SPAWN_TUNING.podMaturityTurn).toBe(8);
    // What the pod placer does, and nothing else of it.
    const podded = placeSporePod(state, map, CRASH, deps());
    expect({ ...setUp.value, edgeSpawn: podded.edgeSpawn }).toEqual(podded);
  });

  it("lets the edges send two waves and then fall quiet", () => {
    const map = crater();
    const state = missionWith(map, []);
    const setUp = CRASH_SITE_SETUP.setup(state, map, CRASH, deps());
    if (!setUp.ok) throw new Error(setUp.error.kind);
    expect(SPAWN_TUNING.podEdgeWaves).toBe(2);
    expect(setUp.value.edgeSpawn).toEqual({
      ...state.edgeSpawn,
      totalWaves: 2,
    });
  });
});
