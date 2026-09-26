import { describe, expect, it } from "vitest";

import {
  DEFEND_INSTALLATION,
  INFESTATION_CLEARANCE,
} from "../../content/data/mission-types";
import type { MissionType } from "../../content/model/mission-type";
import type { Mission } from "../../overworld/model/mission";
import { HookKinds } from "../model/hook";
import type {
  MissionMapRule,
  MissionMapRules,
} from "../model/mission-map-rule";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "./default-registries";
import { createRegistry } from "../../core/service/definition-registry";
import { generateTacticalMap } from "./generate-tactical-map";
import { validateTacticalMap } from "./map-validator";
import {
  missionToMapRecipe,
  scaledHookCount,
} from "./mission-map-recipe-adapter";
import { MISSION_MAP_RULES } from "./missions/mission-map-rules";

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
    rewards: { credits: 1500, techPoints: 0 },
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
  it("preserves infestation in the serializable recipe and leaves legacy missions clean", () => {
    const infested = unwrap(
      missionToMapRecipe(
        mission({}, { infestation: 4 }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    expect(infested.params.infestation).toBe(4);
    expect(JSON.parse(JSON.stringify(infested))).toEqual(infested);
    const legacy = unwrap(
      missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries),
    );
    expect(legacy.params.infestation ?? 0).toBe(0);
  });
  it("asks for one tech-carcass hook only when the mission carries a carcass (#1171)", () => {
    const plain = unwrap(
      missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries),
    );
    expect(
      plain.params.hooks.some((h) => h.kind === HookKinds.TECH_CARCASS),
    ).toBe(false);
    const priced = unwrap(
      missionToMapRecipe(
        mission({}, { techCarcass: { techPoints: 14 } }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    const carcass = priced.params.hooks.filter(
      (h) => h.kind === HookKinds.TECH_CARCASS,
    );
    expect(carcass).toHaveLength(1);
    expect(carcass[0]).toMatchObject({
      count: 1,
      requiredPass: PassMask.INFANTRY,
      maxNearestDistanceFromDeploy: 30,
    });
    expect(carcass[0]?.minDistanceFromDeploy).toBeGreaterThan(0);
    // The type's own hooks are untouched by the addition.
    expect(priced.params.hooks.slice(0, plain.params.hooks.length)).toEqual(
      plain.params.hooks,
    );
    expect(JSON.parse(JSON.stringify(priced))).toEqual(priced);
  });

  it("requests the composed installation site and asks for its generators only for a defence (#1175)", () => {
    const plain = unwrap(
      missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries),
    );
    expect(plain.params.site).toBeUndefined();
    expect(plain.params.hooks.some((h) => h.kind === HookKinds.GENERATOR)).toBe(
      false,
    );
    const defended = unwrap(
      missionToMapRecipe(
        mission({
          typeId: "defend-installation",
          defence: {
            installation: "repellent-dispersal",
            deployableId: "dep-1",
            generators: 4,
            waves: 5,
          },
        }),
        DEFEND_INSTALLATION,
        registries,
      ),
    );
    expect(defended.params.site).toBe("repellent-dispersal");
    const generators = defended.params.hooks.filter(
      (h) => h.kind === HookKinds.GENERATOR,
    );
    expect(generators).toHaveLength(1);
    expect(generators[0]).toMatchObject({
      count: 4,
      requiredPass: PassMask.INFANTRY,
      maxNearestDistanceFromDeploy: 30,
    });
    expect(generators[0]?.minDistanceFromDeploy).toBeGreaterThan(0);
    expect(
      defended.params.hooks.some((h) => h.kind === HookKinds.EGG_SPAWNER),
    ).toBe(false);
    expect(JSON.parse(JSON.stringify(defended))).toEqual(defended);
    // And the generator accepts it: the facility is on the map, its
    // generators around it.
    const map = generateTacticalMap(defended, { registries });
    expect(map.buildings.some((b) => b.kind === "repellent-dispersal")).toBe(
      true,
    );
    expect(
      map.hooks.objectives.filter((h) => h.kind === HookKinds.GENERATOR),
    ).toHaveLength(4);
  });

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

  it("carries recognised mission cities into saved recipes and leaves others unprofiled", () => {
    for (const cityId of ["lagos", "perth", "johannesburg"]) {
      const recipe = unwrap(
        missionToMapRecipe(
          mission({ cityId }),
          INFESTATION_CLEARANCE,
          registries,
        ),
      );
      expect(recipe.params.placeProfile).toBe(cityId);
      expect(JSON.parse(JSON.stringify(recipe))).toEqual(recipe);
    }
    const recipe = unwrap(
      missionToMapRecipe(
        mission({ cityId: "nairobi" }),
        INFESTATION_CLEARANCE,
        registries,
      ),
    );
    expect(recipe.params).not.toHaveProperty("placeProfile");
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
    // Between the two above in the source, and the only one of the four
    // this test had ever missed (#735).
    const badSettlement = missionToMapRecipe(
      mission(
        {},
        { settlement: "arcology" as Mission["mapParams"]["settlement"] },
      ),
      INFESTATION_CLEARANCE,
      registries,
    );
    expect(badSettlement).toEqual({
      ok: false,
      error: { kind: "unknown-settlement", id: "arcology" },
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
      requiredHooks: [{ kind: "warp-gate", count: 1 }],
    };
    expect(missionToMapRecipe(mission(), hiveAssault, registries)).toEqual({
      ok: false,
      error: { kind: "unknown-hook-kind", id: "warp-gate" },
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

describe("missionToMapRecipe with the mission map rules (ADR 0013 §2.3)", () => {
  /** The shipped table with the clearance's rule swapped for `rule`. */
  function withClearanceRule(
    rule: Omit<MissionMapRule, "typeId">,
  ): MissionMapRules {
    return {
      ...MISSION_MAP_RULES,
      "infestation-clearance": { typeId: "infestation-clearance", ...rule },
    };
  }

  it("takes the archetype, extra hooks, site and landmark from the type's rule", () => {
    const seen: [Mission, MissionType][] = [];
    const rules = withClearanceRule({
      recipe: (m, type) => {
        seen.push([m, type]);
        return {
          archetype: "crash-site",
          extraHooks: [{ kind: HookKinds.SPORE_POD, count: 1 }],
          site: "a-site",
          landmark: "a-landmark",
        };
      },
    });
    const offer = mission();
    const recipe = unwrap(
      missionToMapRecipe(offer, INFESTATION_CLEARANCE, registries, rules),
    );
    expect(seen).toEqual([[offer, INFESTATION_CLEARANCE]]);
    expect(recipe.params.archetype).toBe("crash-site");
    expect(recipe.params.site).toBe("a-site");
    expect(recipe.params.landmark).toBe("a-landmark");
    // The extra hook is completed from the kind's defaults like any other.
    expect(
      recipe.params.hooks.find((h) => h.kind === HookKinds.SPORE_POD),
    ).toEqual({
      kind: HookKinds.SPORE_POD,
      count: 1,
      requiredPass: PassMask.ALL,
      minDistanceFromDeploy: 10,
    });
    expect(JSON.parse(JSON.stringify(recipe))).toEqual(recipe);
  });

  it("keeps the hook order: the type's, then the carcass, then the rule's", () => {
    const recipe = unwrap(
      missionToMapRecipe(
        mission(
          {
            typeId: "defend-installation",
            defence: {
              installation: "repellent-dispersal",
              deployableId: "dep-1",
              generators: 3,
              waves: 4,
            },
          },
          { techCarcass: { techPoints: 10 } },
        ),
        DEFEND_INSTALLATION,
        registries,
      ),
    );
    expect(recipe.params.hooks.map((h) => h.kind)).toEqual([
      HookKinds.DEPLOY,
      HookKinds.EDGE_SPAWN,
      HookKinds.EXTRACTION,
      HookKinds.TECH_CARCASS,
      HookKinds.GENERATOR,
    ]);
    expect(Object.keys(recipe.params)).toEqual([
      "archetype",
      "biome",
      "settlement",
      "size",
      "hooks",
      "site",
    ]);
  });

  it("refuses an extra hook kind no placer serves", () => {
    const rules = withClearanceRule({
      recipe: () => ({
        archetype: "settlement",
        extraHooks: [{ kind: "warp-gate", count: 1 }],
      }),
    });
    expect(
      missionToMapRecipe(mission(), INFESTATION_CLEARANCE, registries, rules),
    ).toEqual({
      ok: false,
      error: { kind: "unknown-hook-kind", id: "warp-gate" },
    });
  });

  it("builds a crash site the generator accepts, pod and all, from a crash-site rule", () => {
    const crashSite: MissionType = {
      ...INFESTATION_CLEARANCE,
      requiredHooks: [
        { kind: HookKinds.DEPLOY, count: 1 },
        { kind: HookKinds.SPORE_POD, count: 1 },
        { kind: HookKinds.EDGE_SPAWN, count: 2 },
        { kind: HookKinds.EXTRACTION, count: 1 },
      ],
    };
    const rules = withClearanceRule({
      recipe: () => ({ archetype: "crash-site", extraHooks: [] }),
    });
    const recipe = unwrap(
      missionToMapRecipe(
        mission({}, { settlement: "rural", techCarcass: { techPoints: 9 } }),
        crashSite,
        registries,
        rules,
      ),
    );
    const map = generateTacticalMap(recipe, { registries });
    expect(validateTacticalMap(map, registries)).toEqual([]);
    const kinds = map.hooks.objectives.map((h) => h.kind).sort();
    expect(kinds).toEqual([HookKinds.SPORE_POD, HookKinds.TECH_CARCASS]);
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
