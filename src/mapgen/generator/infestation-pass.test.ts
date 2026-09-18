import { describe, expect, it } from "vitest";
import { BIOME_IDS } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { PropKindIds } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { PassMask } from "../model/pass-mask";
import type { MapRecipe } from "../model/map-recipe";
import { createDefaultRegistries } from "../service/default-registries";
import { freezeDraft } from "../service/draft-freezer";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { resolveMapGenParams } from "../service/param-resolver";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { validateTacticalMap } from "../service/map-validator";
import { hasFiringLine } from "./placer/egg-spawner-placer";
import { reachableFromDeploy, snapshotDraft } from "./placer/placer-support";

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
      createSettlementPasses().filter(
        (pass) => !pass.id.startsWith("infestation"),
      ),
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

  it("plans expanding connected colonies and changes the settlement layout", () => {
    const maps = [0, 1, 4, 7, 10].map((level) =>
      generateTacticalMap(recipe(level)),
    );
    expect(generateTacticalMap(recipe(4))).toEqual(maps[2]);
    expect(maps[0]!.infestation).toBeUndefined();
    let previous: readonly number[] = [];
    let coverage = 0;
    for (const map of maps.slice(1)) {
      const plan = map.infestation!;
      expect(plan.influence).toHaveLength(map.width * map.depth);
      plan.influence.forEach((pressure, index) => {
        expect(pressure).toBeGreaterThanOrEqual(previous[index] ?? 0);
        expect(pressure).toBeLessThanOrEqual(1);
      });
      expect(plan.corridors).toHaveLength(plan.zones.length - 1);
      const growth = map.tiles.filter(
        (tile) => tile.surface === SurfaceIds.INFESTED,
      ).length;
      expect(growth).toBeGreaterThan(coverage);
      previous = plan.influence;
      coverage = growth;
      expect(validateTacticalMap(map, registries)).toEqual([]);
    }
    const clean = maps[0]!;
    const overrun = maps.at(-1)!;
    expect(overrun.buildings.map((building) => building.footprint)).not.toEqual(
      clean.buildings.map((building) => building.footprint),
    );
    expect(overrun.infestation!.ruins.length).toBeGreaterThan(0);
    expect(
      overrun.props.some(
        (prop) =>
          prop.kind === PropKindIds.INFESTED_HIVE &&
          prop.occupiedTiles?.length === 4,
      ),
    ).toBe(true);
    expect(
      new Set(
        overrun.props
          .filter((prop) => prop.kind.startsWith("infested-"))
          .map((prop) => prop.kind),
      ).size,
    ).toBeGreaterThanOrEqual(7);
    for (const zone of overrun.infestation!.zones)
      for (const building of overrun.buildings)
        for (const footprint of building.footprint)
          for (let z = footprint.z; z < footprint.z + footprint.d; z++)
            for (let x = footprint.x; x < footprint.x + footprint.w; x++)
              expect(
                Math.hypot(x - zone.centre.x, z - zone.centre.z),
              ).toBeGreaterThan(zone.clearingRadius);
  });

  it("invades streets and interiors without granting mechs access to building floors", () => {
    const map = generateTacticalMap(recipe(10));
    const floor = map.tiles.find(
      (tile) =>
        tile.buildingId !== undefined &&
        tile.surface === SurfaceIds.INFESTED &&
        tile.propId === undefined,
    );
    expect(floor).toBeDefined();
    expect(floor!.pass).toBe(PassMask.INFANTRY);
    const beforeGrowth = generateTacticalMap(recipe(0));
    const streets = new Set(
      beforeGrowth.tiles
        .filter((tile) => tile.surface === SurfaceIds.ROAD)
        .map((tile) => `${tile.x}:${tile.z}`),
    );
    expect(
      map.tiles.some(
        (tile) =>
          tile.surface === SurfaceIds.INFESTED &&
          streets.has(`${tile.x}:${tile.z}`),
      ),
    ).toBe(true);
    expect(validateTacticalMap(map, registries)).toEqual([]);
  });

  it("collapses upper sections while preserving the surviving rooms and stairs", () => {
    const infested = recipe(10);
    const pipeline = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "infestation"),
      registries,
    );
    const beforeCollapse = freezeDraft(
      pipeline.run(infested.params, new Mulberry32Rng(hashSeed(infested.seed)))
        .draft,
      infested,
      registries,
    );
    const afterCollapse = generateTacticalMap(infested);
    const upperTiles = (tiles: typeof afterCollapse.tiles): number =>
      tiles.filter(
        (tile) =>
          tile.buildingId !== undefined &&
          tile.y >
            afterCollapse.buildings.find(
              (building) => building.id === tile.buildingId,
            )!.groundLevel,
      ).length;
    expect(upperTiles(afterCollapse.tiles)).toBeLessThan(
      upperTiles(beforeCollapse.tiles),
    );
    expect(afterCollapse.connectors).toEqual(beforeCollapse.connectors);
    expect(
      afterCollapse.buildings.map((building) => building.entrances),
    ).toEqual(beforeCollapse.buildings.map((building) => building.entrances));
    expect(validateTacticalMap(afterCollapse, registries)).toEqual([]);
  });

  it("spreads across shaped terrain without replacing slopes or their connectors", () => {
    const infested = recipe(10);
    const pipeline = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "infestation"),
      registries,
    );
    const beforeGrowth = freezeDraft(
      pipeline.run(infested.params, new Mulberry32Rng(hashSeed(infested.seed)))
        .draft,
      infested,
      registries,
    );
    const afterGrowth = generateTacticalMap(infested);
    const shape = (map: typeof afterGrowth): unknown[] =>
      map.tiles
        .filter((tile) => tile.slope !== undefined || tile.naturalEdge)
        .map(({ x, y, z, slope, naturalEdge }) => ({
          x,
          y,
          z,
          slope,
          naturalEdge,
        }));
    expect(shape(afterGrowth)).toEqual(shape(beforeGrowth));
    expect(afterGrowth.connectors).toEqual(beforeGrowth.connectors);
    expect(
      afterGrowth.tiles.some(
        (tile) =>
          tile.slope !== undefined && tile.surface === SurfaceIds.INFESTED,
      ),
    ).toBe(true);
    expect(validateTacticalMap(afterGrowth, registries)).toEqual([]);
  });

  it("reclaims mature vegetation before colonies are large enough for wall formations", () => {
    const infested = recipe(5);
    const pipeline = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "infestation"),
      registries,
    );
    const beforeGrowth = freezeDraft(
      pipeline.run(infested.params, new Mulberry32Rng(hashSeed(infested.seed)))
        .draft,
      infested,
      registries,
    );
    const afterGrowth = generateTacticalMap(infested);
    const matureTrees = (map: typeof afterGrowth): number =>
      map.props.filter(
        (prop) =>
          prop.kind.startsWith("tree-") &&
          (map.infestation!.influence[prop.tile.z * map.width + prop.tile.x] ??
            0) > 0.7,
      ).length;
    expect(matureTrees(beforeGrowth)).toBeGreaterThan(0);
    expect(matureTrees(afterGrowth)).toBeLessThan(matureTrees(beforeGrowth));
  });

  it("keeps mech firing routes after colony formations change the settlement", () => {
    const params = { ...recipe(10).params, size: "medium" as const };
    const seed = "colony-scale-medium";
    const before = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "infestation"),
      registries,
    ).run(params, new Mulberry32Rng(hashSeed(seed)));
    const after = new PipelineMapGenerator(
      createSettlementPasses(),
      registries,
    ).run(params, new Mulberry32Rng(hashSeed(seed)));
    const beforeSnapshot = snapshotDraft(
      before.draft,
      before.params,
      registries,
    );
    const afterSnapshot = snapshotDraft(after.draft, after.params, registries);
    const beforeMech = reachableFromDeploy(
      before.draft,
      beforeSnapshot,
      PassMask.MECH,
    );
    const afterMech = reachableFromDeploy(
      after.draft,
      afterSnapshot,
      PassMask.MECH,
    );
    // This seed originally stranded the only firing position at (43,4,15).
    // Colony parcels can now move that room; preserve every firing line that
    // the same completed settlement actually offered before infestation props.
    let shootable = 0;
    for (const hook of before.draft.hooks.objectives) {
      const previous = hook.tiles[0]!;
      if (!hasFiringLine(before.draft, previous, beforeMech)) continue;
      shootable++;
      const current = after.draft.hooks.objectives.find(
        (candidate) => candidate.id === hook.id,
      )!.tiles[0]!;
      expect(current).toEqual(previous);
      expect(hasFiringLine(after.draft, current, afterMech)).toBe(true);
    }
    expect(shootable).toBeGreaterThan(0);
    expect(
      validateTacticalMap(
        freezeDraft(after.draft, { seed, params }, registries),
        registries,
      ),
    ).toEqual([]);
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

  it("reclaims urban street shelters while keeping rural colonies free of them", () => {
    const town = generateTacticalMap(recipe(10));
    expect(
      town.props.some(
        (prop) =>
          prop.kind === PropKindIds.INFESTED_SHELTER &&
          prop.occupiedTiles?.length === 2,
      ),
    ).toBe(true);
    const rural = recipe(10);
    const map = generateTacticalMap({
      ...rural,
      params: { ...rural.params, settlement: "rural" },
    });
    expect(
      map.props.some((prop) => prop.kind === PropKindIds.INFESTED_SHELTER),
    ).toBe(false);
  });

  it.each(["medium", "large"] as const)(
    "keeps mature %s colonies structurally valid",
    (size) => {
      const base = recipe(10);
      const map = generateTacticalMap({
        ...base,
        seed: `colony-scale-${size}`,
        params: { ...base.params, size },
      });
      expect(map.infestation!.zones.length).toBeGreaterThan(3);
      expect(map.infestation!.ruins.length).toBeGreaterThan(0);
      expect(validateTacticalMap(map, registries)).toEqual([]);
    },
    20000,
  );

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
