import { describe, expect, it } from "vitest";

import { EVACUATION } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { CIVILIAN_MISSION_HOOKS } from "../../data/hook-requirements";
import { HookKinds } from "../../model/hook";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import {
  DEFAULT_EVACUATION_GROUPS,
  EVACUATION_MAP_RULE,
} from "./evacuation-map";
import { MISSION_MAP_RULES } from "./mission-map-rules";

// ===========================================
// Fixtures
// ===========================================

/** A d5 evacuation of `groups` groups, or one without its spec. */
function evacuation(groups?: number): Mission {
  return {
    id: "mission-1",
    typeId: "evacuation",
    cityId: "city-1",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "medium",
      seed: "evac-map",
      infestation: 2,
    },
    rewards: { credits: 1500, techPoints: 15 },
    createdDay: 0,
    expiresDay: 4,
    ignorePenalty: 0,
    ...(groups === undefined
      ? {}
      : { evacuation: { groups, creditsPerGroup: 100 } }),
  };
}

// ===========================================
// Tests
// ===========================================

describe("EVACUATION_MAP_RULE (arc §6.4)", () => {
  it("is the evacuation's entry in the shipped table", () => {
    expect(MISSION_MAP_RULES.evacuation).toBe(EVACUATION_MAP_RULE);
    expect(EVACUATION_MAP_RULE.typeId).toBe("evacuation");
  });

  it("fights in the settlement with one civilian hook per group on the offer", () => {
    for (const groups of [3, 4, 5]) {
      expect(
        EVACUATION_MAP_RULE.recipe(evacuation(groups), EVACUATION),
      ).toEqual({
        archetype: "settlement",
        extraHooks: [{ kind: HookKinds.CIVILIAN, count: groups }],
      });
    }
  });

  it("falls back on the civilian hook set's four for an offer without its spec", () => {
    expect(DEFAULT_EVACUATION_GROUPS).toBe(4);
    expect(EVACUATION_MAP_RULE.recipe(evacuation(), EVACUATION)).toEqual({
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.CIVILIAN, count: 4 }],
    });
  });

  it("asks the map for the civilian hook set's groups, at the offer's count, after the type's own hooks", () => {
    const recipe = missionToMapRecipe(evacuation(5), EVACUATION);
    if (!recipe.ok) throw new Error(recipe.error.kind);
    const hooks = recipe.value.params.hooks;
    expect(hooks.map((hook) => [hook.kind, hook.count])).toEqual([
      [HookKinds.DEPLOY, 1],
      [HookKinds.EGG_SPAWNER, 1],
      [HookKinds.EDGE_SPAWN, 2],
      [HookKinds.EXTRACTION, 1],
      [HookKinds.CIVILIAN, 5],
    ]);
    const civilians = CIVILIAN_MISSION_HOOKS.find(
      (hook) => hook.kind === HookKinds.CIVILIAN,
    );
    expect(hooks.at(-1)).toEqual({ ...civilians, count: 5 });
  });
});
