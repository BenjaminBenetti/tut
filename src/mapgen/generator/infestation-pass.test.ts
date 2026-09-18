import { describe, expect, it } from "vitest";
import { BIOME_IDS } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import type { MapRecipe } from "../model/map-recipe";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { resolveMapGenParams } from "../service/param-resolver";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { validateTacticalMap } from "../service/map-validator";

const registries = createDefaultRegistries();

/** One seed across levels makes the changing infestation directly comparable. */
function recipe(infestation?: number): MapRecipe {
  return {
    seed: "infestation-review",
    params: {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: "small",
      hooks: DEFAULT_MISSION_HOOKS,
      ...(infestation === undefined ? {} : { infestation }),
    },
  };
}

describe("infestation generation", () => {
  it("keeps level zero byte-for-byte equal to the pipeline without infestation", () => {
    const clean = recipe(0);
    const pipeline = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "infestation"),
      registries,
    );
    const baseline = freezeDraft(
      pipeline.run(clean.params, new Mulberry32Rng(hashSeed(clean.seed))).draft,
      clean,
      registries,
    );
    expect(generateTacticalMap(clean)).toEqual(baseline);
    expect(generateTacticalMap(recipe()).tiles).toEqual(baseline.tiles);
  });

  it("is deterministic and increases ground coverage, nests and building damage", () => {
    const maps = [0, 1, 4, 7, 10].map((level) =>
      generateTacticalMap(recipe(level)),
    );
    expect(generateTacticalMap(recipe(4))).toEqual(maps[2]);
    let previous = new Set<string>();
    let missing = 0;
    for (const map of maps) {
      const growth = new Set(
        map.tiles
          .filter((tile) => tile.surface === SurfaceIds.INFESTED)
          .map((tile) => `${tile.x}:${tile.z}`),
      );
      for (const tile of previous) expect(growth.has(tile)).toBe(true);
      if (map.recipe.params.infestation)
        expect(growth.size).toBeGreaterThan(previous.size);
      const roofDamage = map.buildings.reduce(
        (sum, building) => sum + (building.roof.missingTiles?.length ?? 0),
        0,
      );
      expect(roofDamage).toBeGreaterThanOrEqual(missing);
      missing = roofDamage;
      previous = growth;
      expect(validateTacticalMap(map, registries)).toEqual([]);
    }
    const clean = maps[0]!;
    const overrun = maps.at(-1)!;
    expect(
      overrun.props.filter((prop) => prop.kind === PropKindIds.INFESTED_NEST)
        .length,
    ).toBeGreaterThan(0);
    expect(
      overrun.tiles.reduce(
        (sum, tile) =>
          sum +
          Object.values(tile.walls).filter((wall) => wall === "solid").length,
        0,
      ),
    ).toBeLessThan(
      clean.tiles.reduce(
        (sum, tile) =>
          sum +
          Object.values(tile.walls).filter((wall) => wall === "solid").length,
        0,
      ),
    );
    expect(overrun.connectors).toEqual(clean.connectors);
    expect(overrun.hooks).toEqual(clean.hooks);
  });

  it("removes pitched roof sections while retaining the building's walkable structure", () => {
    const base = recipe(10);
    const map = generateTacticalMap({
      ...base,
      params: { ...base.params, settlement: "rural" },
    });
    expect(
      map.buildings.some(
        (building) => (building.roof.missingTiles?.length ?? 0) > 0,
      ),
    ).toBe(true);
    expect(validateTacticalMap(map, registries)).toEqual([]);
  });

  it.each(BIOME_IDS)(
    "keeps %s missions valid across settlements and infestation bands",
    (biome) => {
      for (const settlement of ["rural", "town", "city"] as const) {
        for (const infestation of [1, 4, 10]) {
          const base = recipe(infestation);
          const map = generateTacticalMap({
            ...base,
            seed: `infestation-${biome}-${settlement}`,
            params: { ...base.params, biome, settlement },
          });
          expect(validateTacticalMap(map, registries)).toEqual([]);
          for (const hook of [
            ...map.hooks.deployZones,
            ...map.hooks.objectives,
            ...map.hooks.edgeSpawns,
          ]) {
            for (const coord of hook.tiles)
              expect(
                map.props.some(
                  (prop) =>
                    prop.tile.x === coord.x &&
                    prop.tile.y === coord.y &&
                    prop.tile.z === coord.z,
                ),
              ).toBe(false);
          }
        }
      }
    },
    30000,
  );

  it.each([-1, 11, 4.5, NaN, Infinity])(
    "rejects invalid infestation %s",
    (infestation) => {
      expect(() =>
        resolveMapGenParams(recipe(infestation).params, registries),
      ).toThrow("infestation");
    },
  );

  it("also infests the crash-site archetype", () => {
    const base = recipe(10);
    const map = generateTacticalMap({
      ...base,
      params: { ...base.params, archetype: "crash-site" },
    });
    expect(map.tiles.some((tile) => tile.surface === SurfaceIds.INFESTED)).toBe(
      true,
    );
    expect(validateTacticalMap(map, registries)).toEqual([]);
  });
});
