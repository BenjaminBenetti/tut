import { describe, expect, it } from "vitest";
import { createRegistry } from "../../core/service/definition-registry";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { generateTacticalMap } from "./generate-tactical-map";
import { createDefaultRegistries } from "./default-registries";
import type { MapRecipe } from "../model/map-recipe";

const BASE: MapRecipe = {
  seed: "1892582247",
  params: {
    archetype: "settlement",
    biome: "temperate",
    settlement: "city",
    size: "medium",
    hooks: DEFAULT_MISSION_HOOKS,
  },
};
const localTrees = new Set(["tree-tropical-almond", "tree-oil-palm"]);

describe("place profile generation", () => {
  it.each(["1892582247", "1892582248"])(
    "builds valid deterministic Lagos streets and buildings on seed %s",
    (seed) => {
      const recipe: MapRecipe = {
        seed,
        params: { ...BASE.params, placeProfile: "lagos" },
      };
      const map = generateTacticalMap(recipe);
      expect(
        generateTacticalMap(JSON.parse(JSON.stringify(recipe)) as MapRecipe),
      ).toEqual(map);
      expect(map.props.some((prop) => localTrees.has(prop.kind))).toBe(true);
      expect(
        map.props.some(
          (prop) => prop.kind === "tree-pine" || prop.kind === "tree-oak",
        ),
      ).toBe(false);
      expect(map.buildings.some((building) => building.floors.length > 1)).toBe(
        true,
      );
      expect(
        map.connectors.some((connector) => connector.kind === "ladder"),
      ).toBe(true);
      expect(map.dropships?.length).toBeGreaterThan(0);
    },
  );

  it.each(["temperate", "snowy", "desert", "coastal"] as const)(
    "registering local trees does not leak into ordinary %s maps",
    (biome) => {
      const registries = createDefaultRegistries();
      const previous = {
        ...registries,
        props: createRegistry(
          "prop",
          registries.props.values.filter((prop) => !localTrees.has(prop.id)),
        ),
      };
      const recipe: MapRecipe = {
        ...BASE,
        params: { ...BASE.params, biome, size: "small" },
      };
      expect(generateTacticalMap(recipe, { registries })).toEqual(
        generateTacticalMap(recipe, { registries: previous }),
      );
    },
  );
});
