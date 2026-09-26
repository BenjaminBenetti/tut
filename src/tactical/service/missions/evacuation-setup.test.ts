import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import { hatchInterval } from "../spawn-service";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { placeCivilians } from "./civilian-setup";
import { EVACUATION_SETUP } from "./evacuation-setup";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";

// ===========================================
// Fixtures
// ===========================================

/** A d4 evacuation of three groups, as the director makes them. */
const EVACUATION: Mission = {
  id: "mission-1",
  typeId: "evacuation",
  cityId: "city-1",
  difficulty: 4,
  mapParams: {
    biome: "temperate",
    settlement: "town",
    size: "medium",
    seed: "evac-setup",
  },
  rewards: { credits: 1200, techPoints: 13 },
  createdDay: 1,
  expiresDay: 5,
  ignorePenalty: 0,
  evacuation: { groups: 3, creditsPerGroup: 100 },
};

/** A ground-floor tile. */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

/** A 12×12 field: a deploy corner, a nest, and a civilian hook on each of `groups`. */
function town(groups: readonly TileCoord[]): TacticalMap {
  const builder = new FixtureMapBuilder(12, 12, 2)
    .fillGround()
    .deploy([at(0, 0)])
    .objective(HookKinds.EGG_SPAWNER, [at(10, 10)]);
  for (const tile of groups) {
    builder.objective(HookKinds.CIVILIAN, [tile]);
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
  };
}

// ===========================================
// Tests
// ===========================================

describe("EVACUATION_SETUP (campaign arc §6.4)", () => {
  it("is the evacuation's entry in the shipped table", () => {
    expect(MISSION_SETUP_RULES.evacuation).toBe(EVACUATION_SETUP);
    expect(EVACUATION_SETUP.typeId).toBe("evacuation");
  });

  it("places a trapped group on every civilian hook and one rescue over them", () => {
    const map = town([at(6, 2), at(3, 8), at(9, 5)]);
    const state = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const setUp = EVACUATION_SETUP.setup(state, map, EVACUATION, deps());
    if (!setUp.ok) throw new Error(setUp.error.kind);

    const groups = setUp.value.units.filter((u) => u.kind === "civilian");
    expect(groups.map((unit) => unit.pos)).toEqual([
      at(6, 2),
      at(3, 8),
      at(9, 5),
    ]);
    expect(groups.every((g) => g.trapped === true && g.ap === 0)).toBe(true);
    expect(setUp.value.objectives).toEqual([
      {
        id: "objective-1",
        kind: "rescue-civilians",
        groupIds: groups.map((g) => g.id),
        complete: false,
        failed: false,
      },
    ]);
  });

  it("stands the nest with no objective of its own, on the clearance's hatch clock", () => {
    const map = town([at(6, 2)]);
    const state = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const setUp = EVACUATION_SETUP.setup(state, map, EVACUATION, deps());
    if (!setUp.ok) throw new Error(setUp.error.kind);
    expect(setUp.value.spawners).toEqual([
      {
        id: "spawner-1",
        pos: at(10, 10),
        hatchRadius: expect.any(Number) as number,
        hp: SPAWN_TUNING.spawnerHp,
        timer: hatchInterval(EVACUATION.difficulty, SPAWN_TUNING),
        destroyed: false,
      },
    ]);
    expect(
      setUp.value.objectives.some((o) => o.kind === "destroy-spawner"),
    ).toBe(false);
    // The edges send waves on the open schedule, as a clearance's do.
    expect(setUp.value.edgeSpawn).toEqual(state.edgeSpawn);
    // What the civilian placer does after the nest, and nothing else.
    const nested = { ...state, spawners: setUp.value.spawners };
    const ids = new SequentialIdGenerator();
    ids.nextId("spawner");
    expect(setUp.value).toEqual(
      placeCivilians(nested, map, { ids, civilian: CIVILIAN_TUNING }),
    );
  });

  it("refuses a map with nobody to evacuate", () => {
    const map = town([]);
    const state = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    expect(EVACUATION_SETUP.setup(state, map, EVACUATION, deps())).toEqual({
      ok: false,
      error: {
        kind: "map-recipe",
        reason: "an evacuation map has no civilian groups to rescue",
      },
    });
  });
});
