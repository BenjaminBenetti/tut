import { describe, expect, it } from "vitest";

import { CRASH_SITE } from "../../../content/data/mission-types";
import type { Mission } from "../../../overworld/model/mission";
import { GREAT_POD_MISSION_HOOKS } from "../../data/great-pod-recipe";
import { allHooks, HookKinds } from "../../model/hook";
import type { MapRecipe } from "../../model/map-recipe";
import { generateTacticalMap } from "../generate-tactical-map";
import { missionToMapRecipe } from "../mission-map-recipe-adapter";
import { GREAT_POD_MAP_RULE } from "./great-pod-map";

// ===========================================
// Fixtures
// ===========================================

/** Time for a couple of generations on a loaded runner. */
const TIMEOUT_MS = 60_000;

/** First Skyfall's offer: a pinned d1 crash site on Act I's small board. */
const SKYFALL: Mission = {
  id: "mission-1",
  typeId: "crash-site",
  storyId: "first-skyfall",
  pinned: true,
  cityId: "city-1",
  difficulty: 1,
  mapParams: {
    biome: "temperate",
    settlement: "rural",
    size: "small",
    seed: "skyfall",
    infestation: 1,
  },
  rewards: { credits: 300, techPoints: 17 },
  createdDay: 0,
  expiresDay: 4,
  ignorePenalty: 15,
  crashSite: { landingCityId: "city-1", preLandingInfestation: 0 },
};

/** The map recipe the adapter builds for `mission`; throws on an error. */
function recipeOf(mission: Mission): MapRecipe {
  const recipe = missionToMapRecipe(mission, CRASH_SITE);
  if (!recipe.ok) throw new Error(JSON.stringify(recipe.error));
  return recipe.value;
}

// ===========================================
// Tests
// ===========================================

describe("GREAT_POD_MAP_RULE", () => {
  it("plans the great pod with its own hooks on the mission's board", () => {
    expect(GREAT_POD_MAP_RULE.recipe(SKYFALL, CRASH_SITE)).toEqual({
      archetype: "great-pod",
      extraHooks: [],
      hooks: GREAT_POD_MISSION_HOOKS,
    });
  });

  it(
    "turns First Skyfall into a map with the core and no spore pod",
    () => {
      const recipe = recipeOf(SKYFALL);
      expect(recipe.params.archetype).toBe("great-pod");
      expect(recipe.params.size).toBe("small");
      const map = generateTacticalMap(recipe);
      const kinds = allHooks(map.hooks).map((hook) => hook.kind);
      expect(kinds.filter((kind) => kind === HookKinds.GREAT_POD_CORE)).toHaveLength(1);
      expect(kinds).not.toContain(HookKinds.SPORE_POD);
      expect(kinds).not.toContain(HookKinds.EGG_SPAWNER);
      expect(kinds.filter((kind) => kind === HookKinds.BROOD_CHAMBER)).toHaveLength(5);
    },
    TIMEOUT_MS,
  );

  it(
    "still finds a tech carcass a place on the pod's board",
    () => {
      const recipe = recipeOf({
        ...SKYFALL,
        mapParams: { ...SKYFALL.mapParams, techCarcass: { techPoints: 20 } },
      });
      const map = generateTacticalMap(recipe);
      expect(
        allHooks(map.hooks).filter((hook) => hook.kind === HookKinds.TECH_CARCASS),
      ).toHaveLength(1);
    },
    TIMEOUT_MS,
  );
});
