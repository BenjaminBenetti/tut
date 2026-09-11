import { describe, expect, it } from "vitest";
import { createRegistry } from "../../core/service/definition-registry";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { BIOME_DEFINITIONS } from "../data/biomes";
import { PLACE_PROFILES } from "../data/place-profiles";
import { generateTacticalMap } from "./generate-tactical-map";
import { createDefaultRegistries } from "./default-registries";
import type { MapRecipe } from "../model/map-recipe";

const PERTH_PROPS = new Set([
  "tree-tuart",
  "banksia",
  "grass-tree",
  "limestone-outcrop",
]);
const BASE: MapRecipe = {
  seed: "215428772",
  params: {
    archetype: "settlement",
    biome: "coastal",
    settlement: "town",
    size: "medium",
    hooks: DEFAULT_MISSION_HOOKS,
    placeProfile: "perth",
  },
};

describe("Perth landscape profile (#1083)", () => {
  it.each(["215428772", "1892582247"])(
    "keeps seed %s valid and reproducible with local planting and a waterfront",
    (seed) => {
      const recipe = { ...BASE, seed };
      const map = generateTacticalMap(recipe);
      expect(
        generateTacticalMap(JSON.parse(JSON.stringify(recipe)) as MapRecipe),
      ).toEqual(map);
      expect(map.props.some((p) => p.kind === "tree-tuart")).toBe(true);
      expect(map.props.some((p) => p.kind === "banksia")).toBe(true);
      expect(map.props.some((p) => p.kind === "grass-tree")).toBe(true);
      expect(map.props.some((p) => p.kind === "tree-oak")).toBe(false);
      expect(map.buildings.some((b) => b.floors.length > 1)).toBe(true);
      expect(map.connectors.some((c) => c.kind === "ladder")).toBe(true);
      expect(map.tiles.some((t) => t.surface === "water")).toBe(true);
      expect(map.dropships?.length).toBeGreaterThan(0);
    },
  );

  it("keeps the coastal relief, shoreline and route/building rules", () => {
    const coastal = BIOME_DEFINITIONS.coastal;
    const perth = { ...coastal, ...PLACE_PROFILES.perth.environment };
    expect(perth.terrain).toBe(coastal.terrain);
    expect(perth.hasShoreline).toBe(coastal.hasShoreline);
    expect(perth.buildingKinds).toBe(coastal.buildingKinds);
    expect(perth.roadSurface).toBe(coastal.roadSurface);
    expect(perth.trailSurface).toBe(coastal.trailSurface);
    expect(
      perth.groundSurfaces.some((s) => s.surface === perth.trailSurface),
    ).toBe(false);
  });

  for (const biome of ["temperate", "coastal", "snowy", "desert"] as const) {
    it(`does not leak local LOW-cover planting into unprofiled ${biome} yards`, () => {
      const registries = createDefaultRegistries();
      const withoutPerth = {
        ...registries,
        props: createRegistry(
          "prop",
          registries.props.values.filter((p) => !PERTH_PROPS.has(p.id)),
        ),
      };
      const recipe: MapRecipe = {
        ...BASE,
        params: {
          ...BASE.params,
          biome,
          size: "small",
          placeProfile: undefined,
        },
      };
      expect(generateTacticalMap(recipe, { registries })).toEqual(
        generateTacticalMap(recipe, { registries: withoutPerth }),
      );
    });
  }

  it("leaves the Lagos profile byte-for-byte identical in generated data", () => {
    const registries = createDefaultRegistries();
    const withoutPerth = {
      ...registries,
      props: createRegistry(
        "prop",
        registries.props.values.filter((p) => !PERTH_PROPS.has(p.id)),
      ),
    };
    const recipe: MapRecipe = {
      seed: "1892582247",
      params: {
        ...BASE.params,
        biome: "temperate",
        settlement: "city",
        placeProfile: "lagos",
      },
    };
    expect(generateTacticalMap(recipe, { registries })).toEqual(
      generateTacticalMap(recipe, { registries: withoutPerth }),
    );
  });
});
