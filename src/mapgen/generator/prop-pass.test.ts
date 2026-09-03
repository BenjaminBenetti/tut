import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { rectContains, stepGridPos } from "../../core/service/grid-math";
import { BIOME_DEFINITIONS } from "../data/biomes";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { PROP_DEFINITIONS } from "../data/props";
import { SurfaceIds } from "../data/surfaces";
import { CoverLevel } from "../model/cover";
import { MapDraft } from "../model/map-draft";
import type { GenerationContext } from "../model/generation-pass";
import type { MapGenParams, MapRecipe } from "../model/map-recipe";
import type { TacticalMap } from "../model/tactical-map";
import { createDefaultRegistries } from "../service/default-registries";
import { DiagnosticsCollector } from "../service/diagnostics-collector";
import { freezeDraft } from "../service/draft-freezer";
import type { InvariantId } from "../service/map-validator";
import { validateTacticalMap } from "../service/map-validator";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { BuildingPass } from "./building-pass";
import { InteriorPass } from "./interior-pass";
import { LotPass } from "./lot-pass";
import { PropPass } from "./prop-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  [
    new TerrainPass(),
    new WaterPass(),
    new RoadPass(),
    new LotPass(),
    new BuildingPass(),
    new InteriorPass(),
    new PropPass(),
  ],
  registries,
);

const STRUCTURAL: readonly InvariantId[] = ["I1", "I2", "I3", "I4", "I5"];
const PROP_COVER = new Map(PROP_DEFINITIONS.map((p) => [p.id, p.cover]));

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
): { draft: MapDraft; map: TacticalMap } {
  const params: MapGenParams = {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks: [],
  };
  const recipe: MapRecipe = { seed, params };
  const { draft } = generator.run(params, new Mulberry32Rng(hashSeed(seed)));
  return { draft, map: freezeDraft(draft, recipe, registries) };
}

/** Columns that could hold vegetation, props included. */
function openGroundColumns(draft: MapDraft): number {
  let count = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const surface = draft.groundSurfaceAt(x, z);
      if (
        !draft.isCovered(x, z) &&
        !draft.isRoad(x, z) &&
        surface !== SurfaceIds.WATER &&
        surface !== SurfaceIds.SIDEWALK
      ) {
        count++;
      }
    }
  }
  return count;
}

const SEEDS = 5;

describe("PropPass", () => {
  it("keeps maps structurally valid and never blocks thresholds or connectors", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const { draft, map } = run(biome, settlement, `props-${i}`);
          const violations = validateTacticalMap(map, registries).filter((v) =>
            STRUCTURAL.includes(v.invariant),
          );
          expect(
            violations.map((v) => `${v.invariant}: ${v.message}`),
            label,
          ).toEqual([]);
          expect(draft.props.length, label).toBeGreaterThan(0);
          const forbidden = new Set<number>();
          for (const building of draft.buildings) {
            for (const entrance of building.entrances) {
              forbidden.add(draft.tileKey(entrance.tile));
              const outside = stepGridPos(entrance.tile, entrance.side);
              forbidden.add(
                draft.tileKey(draft.groundCoord(outside.x, outside.z)),
              );
            }
          }
          for (const connector of draft.connectors) {
            forbidden.add(draft.tileKey(connector.from));
            forbidden.add(draft.tileKey(connector.to));
          }
          for (const prop of draft.props) {
            expect(
              forbidden.has(draft.tileKey(prop.tile)),
              `${label} ${prop.id}`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it("scatters vegetation at the biome's density on open ground only", () => {
    for (const biome of BIOME_IDS) {
      const definition = BIOME_DEFINITIONS[biome];
      const vegetation = new Set(definition.vegetation.map((v) => v.prop));
      const expected = definition.vegetation.reduce(
        (sum, v) => sum + v.density,
        0,
      );
      let placed = 0;
      let open = 0;
      for (let i = 0; i < 12; i++) {
        const { draft } = run(biome, "rural", `veg-${i}`);
        open += openGroundColumns(draft);
        for (const prop of draft.props) {
          if (!vegetation.has(prop.kind)) continue;
          placed++;
          const { x, z } = prop.tile;
          expect(draft.isRoad(x, z), biome).toBe(false);
          expect(draft.groundSurfaceAt(x, z), biome).not.toBe(SurfaceIds.WATER);
          expect(draft.isCovered(x, z), biome).toBe(false);
          expect(prop.tile.y).toBe(draft.groundLevelAt(x, z));
        }
      }
      const perHundred = (placed / open) * 100;
      expect(perHundred, biome).toBeGreaterThanOrEqual(expected * 0.75);
      expect(perHundred, biome).toBeLessThanOrEqual(expected * 1.25);
    }
  });

  it("puts street props only on straight, bypassable road columns", () => {
    let street = 0;
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = run("temperate", "city", `street-${i}`);
      for (const prop of draft.props) {
        const { x, z } = prop.tile;
        if (!draft.isRoad(x, z)) continue;
        street++;
        const roadPair = (dx: number, dz: number): boolean =>
          draft.inBounds(x + dx, z + dz) &&
          draft.isRoad(x + dx, z + dz) &&
          draft.inBounds(x - dx, z - dz) &&
          draft.isRoad(x - dx, z - dz);
        const alongX = roadPair(1, 0);
        const alongZ = roadPair(0, 1);
        expect(alongX !== alongZ, `${prop.id} on a crossing or road end`).toBe(
          true,
        );
        const level = draft.groundLevelAt(x, z);
        const across: readonly (readonly [number, number])[] = alongX
          ? [
              [0, 1],
              [0, -1],
            ]
          : [
              [1, 0],
              [-1, 0],
            ];
        const bypass = across.some(([dx, dz]) => {
          const nx = x + dx;
          const nz = z + dz;
          return (
            draft.inBounds(nx, nz) &&
            !draft.isCovered(nx, nz) &&
            draft.groundSurfaceAt(nx, nz) !== SurfaceIds.WATER &&
            draft.groundLevelAt(nx, nz) === level &&
            draft.propAt(draft.groundCoord(nx, nz)) === undefined
          );
        });
        expect(bypass, prop.id).toBe(true);
      }
    }
    expect(street).toBeGreaterThan(0);
  });

  it("places street props on a trail that hugs the map edge without throwing", () => {
    // Regression for #221: the rotation lookup read the column beyond the
    // edge and tripped the draft's bounds check.
    const draft = new MapDraft(
      8,
      8,
      new SequentialIdGenerator(),
      SurfaceIds.GRASS,
    );
    for (let z = 0; z < draft.depth; z++) {
      draft.setRoad(0, z);
      draft.setGroundSurface(0, z, SurfaceIds.DIRT);
    }
    const settlement = {
      ...SETTLEMENT_DEFINITIONS.rural,
      streetPropDensity: 100,
    };
    const diagnostics = new DiagnosticsCollector();
    const context: GenerationContext = {
      params: {
        archetype: "settlement",
        width: draft.width,
        depth: draft.depth,
        biome: BIOME_DEFINITIONS.temperate,
        settlement,
        hooks: [],
      },
      rng: new Mulberry32Rng(hashSeed("edge-trail")),
      draft,
      registries,
      diagnostics: diagnostics.forPass("props"),
    };
    expect(() => new PropPass().run(context)).not.toThrow();
    expect(draft.props.some((p) => p.tile.x === 0)).toBe(true);
  });

  it("stacks interior props only in storage rooms", () => {
    let interior = 0;
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = run("snowy", "town", `interior-${i}`);
      for (const prop of draft.props) {
        const tile = draft.getTile(prop.tile);
        if (tile?.buildingId === undefined) continue;
        interior++;
        const building = draft.buildings.find((b) => b.id === tile.buildingId);
        const room = building?.floors
          .flatMap((f) => f.rooms.map((r) => ({ r, y: f.y })))
          .find(
            ({ r, y }) => y === tile.y && rectContains(r.rect, tile.x, tile.z),
          );
        expect(room?.r.kind, prop.id).toBe("storage");
      }
    }
    expect(interior).toBeGreaterThan(0);
  });

  it("mixes low and high cover in towns and cities", () => {
    const counts = { low: 0, high: 0, total: 0 };
    for (const settlement of ["town", "city"] as const) {
      for (let i = 0; i < SEEDS; i++) {
        for (const prop of run("coastal", settlement, `cover-${i}`).draft
          .props) {
          counts.total++;
          const cover = PROP_COVER.get(prop.kind);
          if (cover === CoverLevel.LOW) counts.low++;
          if (cover === CoverLevel.HIGH) counts.high++;
        }
      }
    }
    expect(counts.low / counts.total).toBeGreaterThanOrEqual(0.3);
    expect(counts.high / counts.total).toBeGreaterThanOrEqual(0.2);
  });

  it("is deterministic per seed", () => {
    expect(run("desert", "town", "det").map).toEqual(
      run("desert", "town", "det").map,
    );
  });
});
