import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DIRECTIONS } from "../../core/model/direction";
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
import {
  ALL_PROP_PLACEMENTS,
  PropPass,
  type PropPlacementKind,
} from "./prop-pass";
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

  it("clumps clustered kinds so most have a same-kind neighbour", () => {
    // Independent scatter at these densities gives ~10–16 % (measured on
    // main); clusters lift temperate and snowy well past 40 %.
    for (const biome of ["temperate", "snowy"] as const) {
      const clustered = new Set(
        BIOME_DEFINITIONS[biome].vegetation
          .filter((v) => v.cluster !== undefined)
          .map((v) => v.prop),
      );
      let total = 0;
      let withSameKind = 0;
      for (let i = 0; i < 12; i++) {
        const { draft } = run(biome, "rural", `clump-${i}`);
        for (const prop of draft.props) {
          if (!clustered.has(prop.kind)) continue;
          total++;
          const near = DIRECTIONS.some((direction) => {
            const next = stepGridPos(prop.tile, direction);
            if (!draft.inBounds(next.x, next.z)) return false;
            return (
              draft.propAt(draft.groundCoord(next.x, next.z))?.kind ===
              prop.kind
            );
          });
          if (near) withSameKind++;
        }
      }
      expect(total, biome).toBeGreaterThan(0);
      expect(withSameKind / total, biome).toBeGreaterThan(0.4);
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

  it("furnishes every room kind from its table and no room beyond it", () => {
    let interior = 0;
    const perBuilding: number[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = run("snowy", "town", `interior-${i}`);
      const counts = new Map<string, number>();
      for (const prop of draft.props) {
        const tile = draft.getTile(prop.tile);
        if (tile?.buildingId === undefined) continue;
        interior++;
        counts.set(tile.buildingId, (counts.get(tile.buildingId) ?? 0) + 1);
        const building = draft.buildings.find((b) => b.id === tile.buildingId);
        const room = building?.floors
          .flatMap((f) => f.rooms.map((r) => ({ r, y: f.y })))
          .find(
            ({ r, y }) => y === tile.y && rectContains(r.rect, tile.x, tile.z),
          );
        expect(room?.r.kind, prop.id).toBeDefined();
        const furnishing = registries.roomFurnishing.get(room?.r.kind ?? "");
        expect(furnishing.props, `${prop.id} in ${room?.r.kind}`).toContain(
          prop.kind,
        );
        const area = room === undefined ? 0 : room.r.rect.w * room.r.rect.d;
        expect(
          draft.props.filter((p) => {
            const t = draft.getTile(p.tile);
            return (
              t !== undefined &&
              t.buildingId === tile.buildingId &&
              t.y === tile.y &&
              room !== undefined &&
              rectContains(room.r.rect, t.x, t.z)
            );
          }).length,
          `${prop.id} room quota`,
        ).toBeLessThanOrEqual(
          Math.min(
            furnishing.maxProps,
            Math.floor(area / furnishing.tilesPerProp),
          ),
        );
      }
      for (const building of draft.buildings) {
        perBuilding.push(counts.get(building.id) ?? 0);
      }
    }
    expect(interior).toBeGreaterThan(0);
    const mean = perBuilding.reduce((a, b) => a + b, 0) / perBuilding.length;
    expect(mean).toBeGreaterThanOrEqual(1);
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

// ===========================================
// Configurable placements (#714)
// ===========================================

/**
 * Runs a pipeline whose prop pass performs only `placements`, and returns
 * the props it left on the draft, keyed by kind.
 */
function propsFrom(
  placements: readonly PropPlacementKind[] | undefined,
  seed: string,
): readonly { kind: string; x: number; z: number; y: number }[] {
  // The same id on purpose: a pass's stream is `rng.fork(pass.id)`, so
  // comparing placements only means anything at a fixed id.
  const pass =
    placements === undefined
      ? new PropPass()
      : new PropPass({ id: "props", placements });
  const pipeline = new PipelineMapGenerator(
    [
      new TerrainPass(),
      new WaterPass(),
      new RoadPass(),
      new LotPass(),
      new BuildingPass(),
      new InteriorPass(),
      pass,
    ],
    registries,
  );
  const { draft } = pipeline.run(
    {
      archetype: "settlement",
      biome: "temperate",
      settlement: "town",
      size: "medium",
      hooks: [],
    },
    new Mulberry32Rng(hashSeed(seed)),
  );
  return draft.props.map((prop) => ({
    kind: prop.kind,
    x: prop.tile.x,
    y: prop.tile.y,
    z: prop.tile.z,
  }));
}

describe("PropPass placements", () => {
  it("defaults to the settlement's four placements and id", () => {
    const pass = new PropPass();
    expect(pass.id).toBe("props");
    expect([...pass.requires].sort()).toEqual([
      "buildings",
      "heightmap",
      "interiors",
      "roads",
    ]);
    expect(ALL_PROP_PLACEMENTS).toEqual([
      "vegetation",
      "street",
      "yard",
      "interior",
    ]);
  });

  it("requires only what its placements need", () => {
    expect(
      new PropPass({ id: "veg", placements: ["vegetation"] }).requires,
    ).toEqual(["heightmap"]);
    expect(
      new PropPass({ id: "outdoor", placements: ["vegetation", "street"] })
        .requires,
    ).toEqual(["heightmap", "roads"]);
    // The point of the split: no buildings demanded to scatter trees.
    expect(
      new PropPass({ id: "veg2", placements: ["vegetation"] }).requires,
    ).not.toContain("interiors");
  });

  /**
   * The property the configuration rests on, stated exactly. At a fixed
   * pass id each placement draws from a labelled fork, and a labelled fork
   * leaves its parent untouched, so no placement can reroute another's
   * stream. `interior` is the one that proves it: it works inside
   * buildings, so it competes with no outdoor placement for tiles, and
   * dropping the other three must leave it bit-for-bit where it was.
   *
   * The id is held fixed deliberately: `rng.fork(pass.id)` means a pass
   * given a new id rerolls everything it places, which is why the crash
   * site's `crash-vegetation` is its own scattering rather than a subset
   * of a settlement's trees.
   */
  it("places interior props identically when every outdoor placement is dropped", () => {
    const key = (p: {
      kind: string;
      x: number;
      y: number;
      z: number;
    }): string => `${p.kind}@${String(p.x)},${String(p.y)},${String(p.z)}`;
    const full = new Set(
      propsFrom(undefined, "placement-independence").map(key),
    );
    const interiorOnly = propsFrom(["interior"], "placement-independence");
    expect(interiorOnly.length).toBeGreaterThan(0);
    for (const prop of interiorOnly) {
      expect(
        full.has(key(prop)),
        `${key(prop)} moved when dropping others`,
      ).toBe(true);
    }
  });

  /**
   * The other half of the same truth, and the reason the test above names
   * `interior` rather than any placement. The outdoor three share open
   * ground, so dropping one does not simply subtract its props — the
   * others expand into the tiles it would have taken.
   *
   * Stated as an identity, because the per-kind direction is not stable:
   * were the placements independent, dropping vegetation would leave
   * exactly `full - vegetationOnly` props behind. It leaves more, on every
   * seed measured. (A single kind can go either way — `barrier` rises on
   * one seed and falls on another — so counting one kind would be a flaky
   * test of a real property.)
   */
  it("lets the outdoor placements spread into ground a dropped one would have used", () => {
    for (const seed of ["compete", "placement-competition", "s3"]) {
      const full = propsFrom(undefined, seed).length;
      const vegetationOnly = propsFrom(["vegetation"], seed).length;
      const withoutVegetation = propsFrom(
        ["street", "yard", "interior"],
        seed,
      ).length;
      expect(
        withoutVegetation,
        `${seed}: expected the outdoor placements to take freed ground`,
      ).toBeGreaterThan(full - vegetationOnly);
    }
  });

  it("places nothing at all when given no placements", () => {
    expect(propsFrom([], "empty-placements")).toHaveLength(0);
  });
});
