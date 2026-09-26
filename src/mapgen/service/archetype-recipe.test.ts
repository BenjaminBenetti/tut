import { describe, expect, it } from "vitest";

import { ARCHETYPE_RECIPE_DEFAULTS } from "../data/archetype-recipe-defaults";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import {
  HIVE_CAVERN_HOOKS,
  HIVE_CAVERN_SIZE,
} from "../data/hive-cavern-recipe";
import type { MapRecipe } from "../model/map-recipe";
import { withArchetypeDefaults } from "./archetype-recipe";

/** A preview-style recipe: a size preset and the settlement's hooks. */
function recipe(archetype: MapRecipe["params"]["archetype"]): MapRecipe {
  return {
    seed: "s",
    params: {
      archetype,
      biome: "temperate",
      settlement: "town",
      size: "medium",
      hooks: DEFAULT_MISSION_HOOKS,
    },
  };
}

describe("withArchetypeDefaults (#1179)", () => {
  it("gives a hive cavern its own board and hooks", () => {
    const result = withArchetypeDefaults(
      recipe("hive-cavern"),
      ARCHETYPE_RECIPE_DEFAULTS,
    );
    expect(result.params.size).toEqual(HIVE_CAVERN_SIZE);
    expect(result.params.hooks).toBe(HIVE_CAVERN_HOOKS);
    expect(result.params.biome).toBe("temperate");
  });

  it("leaves an archetype without defaults untouched", () => {
    const settlement = recipe("settlement");
    expect(withArchetypeDefaults(settlement, ARCHETYPE_RECIPE_DEFAULTS)).toBe(
      settlement,
    );
  });
});
