import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import { BUG_SPECIES } from "../../../bugs/data/species";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import { DEFAULT_HATCH_RADIUS } from "../../model/tactical-state";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { placeSporePod } from "./spore-pod-setup";

// ===========================================
// Fixtures
// ===========================================

/** A field with a nest hook and a spore-pod hook, in that order. */
function crashField() {
  return openField()
    .objective(HookKinds.EGG_SPAWNER, [{ x: 1, y: 0, z: 6 }])
    .objective(HookKinds.SPORE_POD, [{ x: 5, y: 0, z: 4 }], PassMask.ALL)
    .build();
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

// ===========================================
// Tests
// ===========================================

describe("placeSporePod (campaign arc §6.3)", () => {
  it("stands a pod on the spore-pod hook with its destroy-pod objective, deadline turn 8", () => {
    const map = crashField();
    const state = missionWith(map, [
      unitAt("u", "infantry", { x: 0, y: 0, z: 0 }),
    ]);
    const placed = placeSporePod(state, map, { difficulty: 1 }, deps());
    expect(placed.spawners).toEqual([
      {
        id: "spawner-1",
        variant: "spore-pod",
        pos: { x: 5, y: 0, z: 4 },
        hatchRadius: DEFAULT_HATCH_RADIUS,
        hp: SPAWN_TUNING.podHp,
        timer: 0,
        destroyed: false,
      },
    ]);
    expect(placed.objectives).toEqual([
      {
        id: "objective-1",
        kind: "destroy-pod",
        targetId: "spawner-1",
        complete: false,
        deadlineTurn: 8,
      },
    ]);
    // The nest hook is the clearance's business, not the pod's.
    expect(placed.units).toBe(state.units);
  });

  it("gives a harder mission's pod more hit points", () => {
    const map = crashField();
    const state = missionWith(map, []);
    const hp = (difficulty: number): number | undefined =>
      placeSporePod(state, map, { difficulty }, deps()).spawners[0]?.hp;
    expect(hp(1)).toBe(40);
    expect(hp(3)).toBe(50);
    expect(hp(5)).toBe(60);
  });

  it("appends to what the mission already has and leaves a map without the hook alone", () => {
    const bare = openField().build();
    const state = missionWith(bare, []);
    expect(placeSporePod(state, bare, { difficulty: 1 }, deps())).toEqual(
      state,
    );
  });
});
