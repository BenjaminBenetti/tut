import { describe, expect, it } from "vitest";
import { BIOME_IDS } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { MapRecipe } from "../model/map-recipe";
import { generateTacticalMap } from "./generate-tactical-map";
import { infestMap } from "./infestation-service";
import { createDefaultRegistries } from "./default-registries";
import { validateTacticalMap } from "./map-validator";

const RECIPE: MapRecipe = {
  seed: "resin-regression",
  params: {
    archetype: "settlement",
    biome: "temperate",
    settlement: "town",
    size: "small",
    hooks: DEFAULT_MISSION_HOOKS,
  },
};

describe("infestation generation", () => {
  it("leaves omitted/zero recipes clean, with identical base generation at every level", () => {
    const clean = generateTacticalMap(RECIPE);
    const zero = generateTacticalMap({
      ...RECIPE,
      params: { ...RECIPE.params, infestationLevel: 0 },
    });
    expect(zero.tiles).toEqual(clean.tiles);
    expect(clean.tiles.every((tile) => !("infested" in tile))).toBe(true);
    let previous = new Set<string>();
    for (let level = 1; level <= 10; level++) {
      const map = generateTacticalMap({
        ...RECIPE,
        params: { ...RECIPE.params, infestationLevel: level },
      });
      const covered = new Set(
        map.tiles.filter((t) => t.infested).map((t) => `${t.x},${t.y},${t.z}`),
      );
      expect(covered.size).toBeGreaterThan(previous.size);
      expect([...previous].every((key) => covered.has(key))).toBe(true);
      expect(map.tiles.map(({ infested: _infested, ...tile }) => tile)).toEqual(
        clean.tiles,
      );
      expect(map.buildings).toEqual(clean.buildings);
      expect(map.props).toEqual(clean.props);
      expect(map.connectors).toEqual(clean.connectors);
      expect(map.hooks).toEqual(clean.hooks);
      expect(map.dropships).toEqual(clean.dropships);
      previous = covered;
    }
    expect(previous.size / clean.tiles.length).toBeGreaterThan(0.85);
  });

  it("is reproducible and serializable, and keeps its random draws independent", () => {
    const recipe = {
      ...RECIPE,
      params: { ...RECIPE.params, infestationLevel: 7 },
    };
    const first = generateTacticalMap(recipe);
    expect(generateTacticalMap(recipe)).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    const root = new Mulberry32Rng(17);
    const before = root.getState();
    infestMap(first, root.fork("infestation"));
    expect(root.getState()).toEqual(before);
  });

  it.each(BIOME_IDS)(
    "keeps %s maps valid at maximum infestation and leaves water clean",
    (biome) => {
      const map = generateTacticalMap({
        ...RECIPE,
        params: { ...RECIPE.params, biome, infestationLevel: 10 },
      });
      expect(validateTacticalMap(map, createDefaultRegistries())).toEqual([]);
      expect(
        map.tiles
          .filter((t) => t.surface === "water")
          .every((t) => !t.infested),
      ).toBe(true);
      expect(map.tiles.filter((t) => t.infested).length).toBeGreaterThan(0);
    },
  );

  it.each([-1, 11, 2.5, NaN, Infinity])(
    "rejects invalid level %s",
    (infestationLevel) => {
      expect(() =>
        generateTacticalMap({
          ...RECIPE,
          params: { ...RECIPE.params, infestationLevel },
        }),
      ).toThrow("infestationLevel");
    },
  );
});
