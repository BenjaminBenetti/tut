import { describe, expect, it } from "vitest";

import { HIVE_ASSAULT } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import {
  GREAT_HIVE_CAVERN_HOOKS,
  GREAT_HIVE_CAVERN_SIZE,
} from "../../data/great-hive-cavern-recipe";
import { GREAT_HIVE_NEST_TUNING } from "../../data/great-hive-nest-tuning";
import { HIVE_CAVERN_SIZE } from "../../data/hive-cavern-recipe";
import { allHooks, HookKinds } from "../../model/hook";
import type { MissionMapRule } from "../../model/mission-map-rule";
import { generateTacticalMap } from "../generate-tactical-map";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import { GREAT_HIVE_MAP_RULE, withGreatHiveMap } from "./great-hive-map";
import { HIVE_ASSAULT_MAP_RULE, hiveNestCount } from "./hive-assault-map";
import { MISSION_MAP_RULES } from "./mission-map-rules";

// ===========================================
// Fixtures
// ===========================================

/** Time for one Great Hive cavern generation on a loaded runner. */
const SWEEP_TIMEOUT_MS = 120_000;

/** A Hive Assault offer against a hive of `level`, a Great Hive when `great`. */
function assault(level: number, great: boolean, seed = "gh-1"): Mission {
  return {
    id: "mission-1",
    typeId: "hive-assault",
    cityId: "city-1",
    difficulty: 8,
    mapParams: { biome: "temperate", settlement: "city", size: "large", seed },
    hive: {
      hiveId: great ? "greathive-1" : "hive-1",
      regionId: "east",
      level,
      ...(great ? { great: true as const } : {}),
    },
    rewards: { credits: 1800, techPoints: 170 },
    createdDay: 200,
    expiresDay: 207,
    ignorePenalty: 0,
    pinned: true,
  };
}

/** The shipped table's hive-assault rule. */
const SHIPPED: MissionMapRule = MISSION_MAP_RULES["hive-assault"];

/** Egg spawners a plan asks for. */
function nestsAsked(mission: Mission): number | undefined {
  return SHIPPED.recipe(mission, HIVE_ASSAULT).hooks?.find(
    (hook) => hook.kind === HookKinds.EGG_SPAWNER,
  )?.count;
}

// ===========================================
// Rule
// ===========================================

describe("GREAT_HIVE_MAP_RULE", () => {
  it("plans a Great Hive on the Great Hive cavern, its own board and hooks", () => {
    const plan = SHIPPED.recipe(assault(0, true), HIVE_ASSAULT);
    expect(plan.archetype).toBe("great-hive-cavern");
    expect(plan.size).toBe(GREAT_HIVE_CAVERN_SIZE);
    expect(plan.extraHooks).toEqual([]);
    expect(
      plan.hooks?.filter((hook) => hook.kind !== HookKinds.EGG_SPAWNER),
    ).toEqual(
      GREAT_HIVE_CAVERN_HOOKS.filter(
        (hook) => hook.kind !== HookKinds.EGG_SPAWNER,
      ),
    );
    expect(plan).toEqual(
      GREAT_HIVE_MAP_RULE.recipe(assault(0, true), HIVE_ASSAULT),
    );
  });

  it("is bigger than the hive cavern on both axes", () => {
    expect(GREAT_HIVE_CAVERN_SIZE.width).toBeGreaterThan(
      HIVE_CAVERN_SIZE.width,
    );
    expect(GREAT_HIVE_CAVERN_SIZE.depth).toBeGreaterThan(
      HIVE_CAVERN_SIZE.depth,
    );
  });

  it("asks for more nests than an ordinary hive at the same level", () => {
    expect([0, 1, 2].map((level) => nestsAsked(assault(level, true)))).toEqual([
      3, 3, 4,
    ]);
    for (const level of [0, 1, 2]) {
      expect(nestsAsked(assault(level, true))).toBeGreaterThan(
        nestsAsked(assault(level, false)) ?? Infinity,
      );
    }
    expect(nestsAsked(assault(12, true))).toBe(GREAT_HIVE_NEST_TUNING.maxNests);
  });
});

describe("withGreatHiveMap", () => {
  it("plans an ordinary Hive Assault exactly as HIVE_ASSAULT_MAP_RULE does", () => {
    for (const level of [0, 3, 9]) {
      expect(SHIPPED.recipe(assault(level, false), HIVE_ASSAULT)).toEqual(
        HIVE_ASSAULT_MAP_RULE.recipe(assault(level, false), HIVE_ASSAULT),
      );
    }
  });

  it("sends only a Great Hive to the rule it is given", () => {
    const calls: string[] = [];
    const tag =
      (name: string): MissionMapRule["recipe"] =>
      (mission, type) => {
        calls.push(name);
        return HIVE_ASSAULT_MAP_RULE.recipe(mission, type);
      };
    const rule = withGreatHiveMap(
      { typeId: "hive-assault", recipe: tag("ordinary") },
      { typeId: "hive-assault", recipe: tag("great") },
    );
    rule.recipe(assault(0, false), HIVE_ASSAULT);
    rule.recipe(assault(0, true), HIVE_ASSAULT);
    expect(calls).toEqual(["ordinary", "great"]);
    expect(rule.typeId).toBe("hive-assault");
  });
});

// ===========================================
// Sweep
// ===========================================

describe("Great Hive caverns generate", () => {
  it(
    "generates and validates Great Hive caverns at level 0 and 2",
    () => {
      for (const [level, seed] of [
        [0, "gh-1"],
        [2, "gh-2"],
      ] as const) {
        const recipe = missionToMapRecipe(
          assault(level, true, seed),
          HIVE_ASSAULT,
        );
        if (!recipe.ok) {
          throw new Error(JSON.stringify(recipe.error));
        }
        const map = generateTacticalMap(recipe.value);
        const count = (kind: string) =>
          allHooks(map.hooks).filter((hook) => hook.kind === kind).length;

        expect(map.width, seed).toBe(GREAT_HIVE_CAVERN_SIZE.width);
        expect(map.depth, seed).toBe(GREAT_HIVE_CAVERN_SIZE.depth);
        expect(count(HookKinds.HIVE_CORE), seed).toBe(1);
        expect(count(HookKinds.EGG_SPAWNER), seed).toBe(
          hiveNestCount(level, GREAT_HIVE_NEST_TUNING),
        );
        expect(count(HookKinds.BROOD_CHAMBER), seed).toBeGreaterThanOrEqual(7);
        expect(count(HookKinds.DEPLOY), seed).toBe(1);
        expect(count(HookKinds.EXTRACTION), seed).toBe(1);
      }
    },
    SWEEP_TIMEOUT_MS,
  );
});
