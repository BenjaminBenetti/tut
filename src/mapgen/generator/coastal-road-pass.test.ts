import { describe, expect, it } from "vitest";
import { DIRECTIONS } from "../../core/model/direction";
import type { Direction } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationPass } from "../model/generation-pass";
import type { MapRecipe } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { ReachabilityService } from "../service/reachability-service";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { TileIndex } from "../service/tile-index";
import { CoastalRoadPass } from "./coastal-road-pass";

const registries = createDefaultRegistries();

/** Runs the real pipeline, optionally omitting only the coastal treatment. */
function generate(recipe: MapRecipe, original = false) {
  const passes = createSettlementPasses().filter(
    (p) => !original || p.id !== "waterfronts",
  );
  const { draft } = new PipelineMapGenerator(passes, registries).run(
    recipe.params,
    new Mulberry32Rng(hashSeed(recipe.seed)),
  );
  return freezeDraft(draft, recipe, registries);
}

/** Turns an edge-relative fixture without changing its lane layout. */
function orient(edge: Direction, lateral: number, inward: number) {
  switch (edge) {
    case "n":
      return { x: lateral, z: inward };
    case "s":
      return { x: lateral, z: 23 - inward };
    case "w":
      return { x: inward, z: lateral };
    case "e":
      return { x: 23 - inward, z: lateral };
  }
}

/** A three-lane street whose last lane projects one tile farther into the shore. */
function coastalFixture(edge: Direction, parallel = false): GenerationPass {
  return {
    id: "fixture",
    requires: [],
    provides: ["water", "roads", "interiors"],
    /** Paints already-graded roads and pavements; the treatment must not regrade them. */
    run({ draft }) {
      const columns = [];
      for (let lateral = 0; lateral < 24; lateral++) {
        const shore = lateral === 10 && !parallel ? 7 : 8;
        for (let inward = 0; inward < 24; inward++) {
          const p = orient(edge, lateral, inward);
          const road =
            inward >= shore &&
            (parallel ? inward <= 10 : lateral >= 8 && lateral <= 10);
          const pavement =
            inward >= shore &&
            (parallel ? inward === 11 : lateral >= 7 && lateral <= 11);
          draft.setGroundLevel(p.x, p.z, inward < shore ? 0 : 1);
          draft.setGroundSurface(
            p.x,
            p.z,
            inward < shore
              ? SurfaceIds.WATER
              : road
                ? SurfaceIds.ROAD
                : pavement
                  ? SurfaceIds.SIDEWALK
                  : SurfaceIds.SAND,
          );
          if (road) {
            draft.setRoad(p.x, p.z);
            columns.push(p);
          }
        }
      }
      draft.roads.push({ id: "road", columns, level: 1 });
    },
  };
}

describe("CoastalRoadPass", () => {
  for (const edge of DIRECTIONS) {
    it(`ends every lane before a railed pavement apron on the ${edge} shore`, () => {
      const { draft } = new PipelineMapGenerator(
        [coastalFixture(edge), new CoastalRoadPass()],
        registries,
      ).run(
        {
          archetype: "settlement",
          biome: "coastal",
          settlement: "town",
          size: { width: 24, depth: 24 },
          hooks: [],
        },
        new Mulberry32Rng(1),
      );
      for (let lateral = 8; lateral <= 10; lateral++) {
        for (let inward = lateral === 10 ? 7 : 8; inward <= 10; inward++) {
          const p = orient(edge, lateral, inward);
          expect(draft.groundSurfaceAt(p.x, p.z)).toBe(SurfaceIds.SIDEWALK);
          expect(draft.groundLevelAt(p.x, p.z)).toBe(1);
          expect(draft.isRoad(p.x, p.z)).toBe(false);
        }
        const road = orient(edge, lateral, 11);
        expect(draft.isRoad(road.x, road.z)).toBe(true);
      }
      for (let lateral = 7; lateral <= 11; lateral++) {
        const p = orient(edge, lateral, lateral === 10 ? 7 : 8);
        expect(draft.wallAt(draft.groundCoord(p.x, p.z), edge)).toBe("half");
      }
      expect(
        draft.roads
          .flatMap((r) => r.columns)
          .every((p) => draft.isRoad(p.x, p.z)),
      ).toBe(true);
    });

    it(`keeps a through street parallel to the ${edge} shore`, () => {
      const recipe = {
        archetype: "settlement" as const,
        biome: "coastal" as const,
        settlement: "town" as const,
        size: { width: 24, depth: 24 },
        hooks: [],
      };
      const before = new PipelineMapGenerator(
        [coastalFixture(edge, true)],
        registries,
      ).run(recipe, new Mulberry32Rng(1)).draft;
      const after = new PipelineMapGenerator(
        [coastalFixture(edge, true), new CoastalRoadPass()],
        registries,
      ).run(recipe, new Mulberry32Rng(1)).draft;
      expect(after.roads).toEqual(before.roads);
      for (let z = 0; z < 24; z++)
        for (let x = 0; x < 24; x++) {
          expect(after.groundSurfaceAt(x, z)).toBe(
            before.groundSurfaceAt(x, z),
          );
          expect(after.wallsAt(after.groundCoord(x, z))).toEqual(
            before.wallsAt(before.groundCoord(x, z)),
          );
        }
    });
  }

  for (const [settlement, size, seed, target] of [
    ["city", "medium", "mc-opening-03", { x: 51, y: 1, z: 40 }],
    ["town", "small", "mc-opening-01", { x: 36, y: 2, z: 13 }],
    ["town", "large", "coast-control-7", { x: 25, y: 2, z: 21 }],
  ] as const) {
    it(`repairs the critic's ${settlement} example without regrading or moving high ground`, () => {
      const recipe: MapRecipe = {
        seed,
        params: {
          archetype: "settlement",
          biome: "coastal",
          settlement,
          size,
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      };
      const before = generate(recipe, true),
        after = generate(recipe);
      expect(validateTacticalMap(after, registries)).toEqual([]);
      expect(after.buildings).toEqual(before.buildings);
      const oldIndex = new TileIndex(before),
        index = new TileIndex(after);
      const reach = new ReachabilityService(
        index,
        after.connectors,
      ).reachableFrom(
        after.hooks.deployZones.flatMap((h) => h.tiles),
        PassMask.MECH,
      );
      expect(oldIndex.getAt(target)?.surface).toBe(SurfaceIds.ROAD);
      expect(index.getAt(target)?.surface).toBe(SurfaceIds.SIDEWALK);
      expect(reach.has(index.keyOf(target))).toBe(true);
      for (const tile of before.tiles) {
        const changed = index.getAt(tile);
        expect(
          changed,
          `original tile ${tile.x},${tile.y},${tile.z}`,
        ).toBeDefined();
        if (tile.surface !== SurfaceIds.ROAD)
          expect(changed?.surface).toBe(tile.surface);
      }
    });
  }

  it("preserves the known-good coastal map and non-coastal generation exactly", () => {
    for (const [biome, seed] of [
      ["coastal", "coast-control-12"],
      ["temperate", "mc-opening-01"],
    ] as const) {
      const recipe: MapRecipe = {
        seed,
        params: {
          archetype: "settlement",
          biome,
          settlement: "town",
          size: "small",
          hooks: DEFAULT_MISSION_HOOKS,
          slopeShare: 1,
        },
      };
      expect(generate(recipe)).toEqual(generate(recipe, true));
    }
  });
});
