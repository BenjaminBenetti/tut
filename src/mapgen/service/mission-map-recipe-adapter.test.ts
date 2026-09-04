import { describe, expect, it } from "vitest";

import { INFESTATION_CLEARANCE } from "../../content/data/mission-types";
import type { MissionType } from "../../content/model/mission-type";
import type { Mission } from "../../overworld/model/mission";
import { HookKinds } from "../model/hook";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "./default-registries";
import { createRegistry } from "./definition-registry";
import { generateTacticalMap } from "./generate-tactical-map";
import { validateTacticalMap } from "./map-validator";
import {
  missionToMapRecipe,
  scaledHookCount,
} from "./mission-map-recipe-adapter";

const registries = createDefaultRegistries();

function mission(
  overrides: Partial<Mission> = {},
  params: Partial<Mission["mapParams"]> = {},
): Mission {
  return {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: "city-1",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "small",
      seed: "mission-1-map",
      ...params,
    },
    rewards: { credits: 1500 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    ...overrides,
  };
}

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe("missionToMapRecipe", () => {
  it("carries the mission's seed and site parameters into the recipe", () => {
    const recipe = unwrap(
      missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries),
    );
    expect(recipe.seed).toBe("mission-1-map");
    expect(recipe.params.archetype).toBe("settlement");
    expect(recipe.params.biome).toBe("temperate");
    expect(recipe.params.settlement).toBe("town");
    expect(recipe.params.size).toBe("small");
  });

  it("scales objective counts with difficulty and fills in kind defaults", () => {
    const easy = unwrap(
      missionToMapRecipe(
        mission({ difficulty: 1 }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    const hard = unwrap(
      missionToMapRecipe(
        mission({ difficulty: 10 }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    const eggs = (hooks: typeof easy.params.hooks): number =>
      hooks.find((h) => h.kind === HookKinds.EGG_SPAWNER)?.count ?? -1;
    expect(eggs(easy.params.hooks)).toBe(2);
    expect(eggs(hard.params.hooks)).toBe(4);
    const egg = hard.params.hooks.find((h) => h.kind === HookKinds.EGG_SPAWNER);
    expect(egg?.requiredPass).toBe(PassMask.INFANTRY);
    expect(egg?.minDistanceFromDeploy).toBe(12);
    expect(egg?.meta).toEqual({ hatchRadius: 3 });
    expect(
      hard.params.hooks.find((h) => h.kind === HookKinds.DEPLOY)?.requiredPass,
    ).toBe(PassMask.ALL);
    expect(hard.params.hooks.map((h) => h.kind)).toEqual([
      "deploy",
      "egg-spawner",
      "edge-spawn",
      "extraction",
    ]);
  });

  it("never asks for a hook farther from deploy than the map can hold", () => {
    // Every preset is larger than twice the shipped 12, so the default
    // passes through; a size registry with a tiny map clamps it (#465).
    const small = unwrap(
      missionToMapRecipe(
        mission({}, { size: "small" }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    const eggs = small.params.hooks.find(
      (hook) => hook.kind === HookKinds.EGG_SPAWNER,
    );
    expect(eggs?.minDistanceFromDeploy).toBe(12);

    const tiny = {
      ...registries,
      mapSizes: createRegistry("map size", [
        { id: "small" as const, width: 16, depth: 16 },
      ]),
    };
    // A long thin map has the room a rule about its shorter side would
    // deny it, so the shipped distance survives there.
    const thin = {
      ...registries,
      mapSizes: createRegistry("map size", [
        { id: "small" as const, width: 16, depth: 40 },
      ]),
    };
    const recipe = unwrap(
      missionToMapRecipe(
        mission({}, { size: "small" }),
        INFESTATION_CLEARANCE,
        tiny,
      ),
    );
    const clamped = recipe.params.hooks.find(
      (hook) => hook.kind === HookKinds.EGG_SPAWNER,
    );
    expect(clamped?.minDistanceFromDeploy).toBe(6);

    const thinRecipe = unwrap(
      missionToMapRecipe(
        mission({}, { size: "small" }),
        INFESTATION_CLEARANCE,
        thin,
      ),
    );
    expect(
      thinRecipe.params.hooks.find(
        (hook) => hook.kind === HookKinds.EGG_SPAWNER,
      )?.minDistanceFromDeploy,
    ).toBe(12);
  });

  it("is deterministic", () => {
    const a = missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries);
    const b = missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries);
    expect(a).toEqual(b);
  });

  it("returns typed errors for ids the registries do not know", () => {
    const badBiome = missionToMapRecipe(
      mission({}, { biome: "lunar" as Mission["mapParams"]["biome"] }),
      INFESTATION_CLEARANCE,
      registries,
    );
    expect(badBiome).toEqual({
      ok: false,
      error: { kind: "unknown-biome", id: "lunar" },
    });
    const badSize = missionToMapRecipe(
      mission({}, { size: "huge" as Mission["mapParams"]["size"] }),
      INFESTATION_CLEARANCE,
      registries,
    );
    expect(badSize).toEqual({
      ok: false,
      error: { kind: "unknown-size", id: "huge" },
    });
    const hiveAssault: MissionType = {
      ...INFESTATION_CLEARANCE,
      requiredHooks: [{ kind: "hive-core", count: 1 }],
    };
    expect(missionToMapRecipe(mission(), hiveAssault, registries)).toEqual({
      ok: false,
      error: { kind: "unknown-hook-kind", id: "hive-core" },
    });
  });

  it("produces a recipe the generator accepts end to end", () => {
    const recipe = unwrap(
      missionToMapRecipe(
        mission({ difficulty: 8 }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    const map = generateTacticalMap(recipe, { registries });
    expect(validateTacticalMap(map, registries)).toEqual([]);
    expect(map.hooks.objectives).toHaveLength(3);
    expect(map.hooks.edgeSpawns).toHaveLength(3);
    expect(map.recipe.seed).toBe("mission-1-map");
  });
});

describe("scaledHookCount", () => {
  it("adds floor(perDifficulty × (difficulty − 1)) and never goes negative", () => {
    expect(
      scaledHookCount({ kind: "x", count: 2, countPerDifficulty: 0.25 }, 1),
    ).toBe(2);
    expect(
      scaledHookCount({ kind: "x", count: 2, countPerDifficulty: 0.25 }, 5),
    ).toBe(3);
    expect(
      scaledHookCount({ kind: "x", count: 2, countPerDifficulty: 0.25 }, 10),
    ).toBe(4);
    expect(scaledHookCount({ kind: "x", count: 1 }, 10)).toBe(1);
    expect(scaledHookCount({ kind: "x", count: 0 }, 0)).toBe(0);
  });
});
