import { describe, expect, it } from "vitest";

import { HIVE_ASSAULT } from "../../../content/data/mission-types";
import type { BiomeId } from "../../../content/model/biome-id";
import type { Mission } from "../../../overworld/model/mission";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
} from "../../data/hive-cavern-recipe";
import { HIVE_NEST_TUNING } from "../../data/hive-nest-tuning";
import { allHooks, HookKinds } from "../../model/hook";
import type { MapRecipe } from "../../model/map-recipe";
import { generateTacticalMap } from "../generate-tactical-map";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import {
  createHiveAssaultMapRule,
  HIVE_ASSAULT_MAP_RULE,
  hiveNestCount,
} from "./hive-assault-map";
import { MISSION_MAP_RULES } from "./mission-map-rules";

// ===========================================
// Fixtures
// ===========================================

/** Maps generated per level in the sweep: three seeds on three biomes. */
const SWEEP: readonly (readonly [BiomeId, string])[] = [
  ["temperate", "hive-1"],
  ["desert", "hive-2"],
  ["snowy", "hive-3"],
];

/** Time for one cavern generation on a loaded runner. */
const SWEEP_TIMEOUT_MS = 120_000;

/** A Hive Assault offer against a hive of `level`, with or without a carcass. */
function assault(
  level: number | undefined,
  seed = "hive-1",
  biome: BiomeId = "temperate",
  carcass = false,
): Mission {
  return {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 6,
    mapParams: {
      biome,
      settlement: "city",
      size: "large",
      seed,
      ...(carcass ? { techCarcass: { techPoints: 22 } } : {}),
    },
    ...(level === undefined
      ? {}
      : { hive: { hiveId: "hive-1", regionId: "east", level } }),
    rewards: { credits: 1800, techPoints: 56 },
    createdDay: 30,
    expiresDay: 37,
    ignorePenalty: 0,
    pinned: true,
  };
}

/** The recipe the shipped adapter and table build for `mission`. */
function recipeOf(mission: Mission): MapRecipe {
  const recipe = missionToMapRecipe(mission, HIVE_ASSAULT);
  if (!recipe.ok) {
    throw new Error(`no recipe: ${JSON.stringify(recipe.error)}`);
  }
  return recipe.value;
}

/** How many hooks of `kind` a recipe asks for. */
function asked(recipe: MapRecipe, kind: string): number {
  return recipe.params.hooks
    .filter((hook) => hook.kind === kind)
    .reduce((sum, hook) => sum + hook.count, 0);
}

// ===========================================
// Rule
// ===========================================

describe("HIVE_ASSAULT_MAP_RULE", () => {
  it("is what the table plans an ordinary hive with (Great Hives: great-hive-map)", () => {
    expect(
      MISSION_MAP_RULES["hive-assault"].recipe(assault(2), HIVE_ASSAULT),
    ).toEqual(HIVE_ASSAULT_MAP_RULE.recipe(assault(2), HIVE_ASSAULT));
  });

  it("selects the hive cavern with its own board and hooks, passed explicitly", () => {
    const plan = HIVE_ASSAULT_MAP_RULE.recipe(assault(2), HIVE_ASSAULT);

    expect(plan.archetype).toBe("hive-cavern");
    expect(plan.size).toBe(HIVE_CAVERN_SIZE);
    expect(plan.extraHooks).toEqual([]);
    expect(plan.hooks).toEqual(HIVE_CAVERN_HOOKS);
  });

  it("gives an older hive's cavern more nests, and nothing else", () => {
    const young = HIVE_ASSAULT_MAP_RULE.recipe(assault(0), HIVE_ASSAULT);
    const old = HIVE_ASSAULT_MAP_RULE.recipe(assault(9), HIVE_ASSAULT);
    const eggs = (hooks = young.hooks) =>
      hooks?.find((hook) => hook.kind === HookKinds.EGG_SPAWNER)?.count;

    expect(eggs(young.hooks)).toBe(2);
    expect(eggs(old.hooks)).toBe(4);
    expect(
      old.hooks?.filter((hook) => hook.kind !== HookKinds.EGG_SPAWNER),
    ).toEqual(
      HIVE_CAVERN_HOOKS.filter((hook) => hook.kind !== HookKinds.EGG_SPAWNER),
    );
  });

  it("reads an offer with no hive as a level-0 hive", () => {
    expect(
      HIVE_ASSAULT_MAP_RULE.recipe(assault(undefined), HIVE_ASSAULT),
    ).toEqual(HIVE_ASSAULT_MAP_RULE.recipe(assault(0), HIVE_ASSAULT));
  });

  it("scales the nests from the tuning it is built with", () => {
    const rule = createHiveAssaultMapRule(HIVE_CAVERN_SIZE, HIVE_CAVERN_HOOKS, {
      ...HIVE_NEST_TUNING,
      baseNests: 3,
      nestsPerLevel: 1,
    });
    const plan = rule.recipe(assault(1), HIVE_ASSAULT);

    expect(
      plan.hooks?.find((hook) => hook.kind === HookKinds.EGG_SPAWNER)?.count,
    ).toBe(4);
  });
});

describe("hiveNestCount", () => {
  it("adds a nest every second level between two and four", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 12].map((level) =>
        hiveNestCount(level, HIVE_NEST_TUNING),
      ),
    ).toEqual([2, 2, 3, 3, 4, 4, 4]);
  });
});

// ===========================================
// Adapter
// ===========================================

describe("missionToMapRecipe — hive assault", () => {
  it("uses the cavern's board in place of the offer's named size", () => {
    expect(recipeOf(assault(1)).params).toMatchObject({
      archetype: "hive-cavern",
      size: HIVE_CAVERN_SIZE,
    });
  });

  it("asks for the cavern's hooks exactly, not the type's requiredHooks", () => {
    const recipe = recipeOf(assault(2));

    expect(recipe.params.hooks).toEqual(HIVE_CAVERN_HOOKS);
  });

  it("still appends the offer's carcass after the cavern's hooks", () => {
    const recipe = recipeOf(assault(2, "hive-1", "temperate", true));

    expect(recipe.params.hooks.slice(0, -1)).toEqual(HIVE_CAVERN_HOOKS);
    expect(recipe.params.hooks.at(-1)?.kind).toBe(HookKinds.TECH_CARCASS);
    expect(asked(recipe, HookKinds.TECH_CARCASS)).toBe(1);
  });
});

// ===========================================
// Sweep
// ===========================================

describe("hive assault caverns generate at every nest count", () => {
  for (const level of [0, 6]) {
    it(
      `generates and validates level-${String(level)} caverns, with a carcass`,
      () => {
        for (const [biome, seed] of SWEEP) {
          const recipe = recipeOf(assault(level, seed, biome, true));
          const map = generateTacticalMap(recipe);
          const count = (kind: string) =>
            allHooks(map.hooks).filter((hook) => hook.kind === kind).length;

          expect(count(HookKinds.HIVE_CORE), seed).toBe(1);
          expect(count(HookKinds.EGG_SPAWNER), seed).toBe(
            hiveNestCount(level, HIVE_NEST_TUNING),
          );
          expect(count(HookKinds.TECH_CARCASS), seed).toBe(1);
          expect(count(HookKinds.DEPLOY), seed).toBe(1);
          expect(count(HookKinds.EXTRACTION), seed).toBe(1);
        }
      },
      SWEEP_TIMEOUT_MS,
    );
  }
});
