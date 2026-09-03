import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { SETTLEMENT_SCALES } from "../../content/model/settlement-scale";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../data/surfaces";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import type { ColumnCoord } from "../model/road";
import { createDefaultRegistries } from "../service/default-registries";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  [new TerrainPass(), new WaterPass(), new RoadPass()],
  registries,
);

function run(
  biome: MapGenParams["biome"],
  settlement: MapGenParams["settlement"],
  seed: string,
  size: MapGenParams["size"] = "small",
): MapDraft {
  const params: MapGenParams = {
    archetype: "settlement",
    biome,
    settlement,
    size,
    hooks: [],
  };
  return generator.run(params, new Mulberry32Rng(hashSeed(seed))).draft;
}

function roadColumns(draft: MapDraft): ColumnCoord[] {
  const out: ColumnCoord[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.isRoad(x, z)) out.push({ x, z });
    }
  }
  return out;
}

const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function components(draft: MapDraft, columns: ColumnCoord[]): number {
  const key = (x: number, z: number): number => z * draft.width + x;
  const members = new Set(columns.map((c) => key(c.x, c.z)));
  const seen = new Set<number>();
  let count = 0;
  for (const start of members) {
    if (seen.has(start)) continue;
    count++;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const k = stack.pop();
      if (k === undefined) break;
      const x = k % draft.width;
      const z = Math.floor(k / draft.width);
      for (const [dx, dz] of STEPS) {
        const nk = key(x + dx, z + dz);
        if (
          draft.inBounds(x + dx, z + dz) &&
          members.has(nk) &&
          !seen.has(nk)
        ) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
  }
  return count;
}

function edgesTouched(draft: MapDraft, columns: ColumnCoord[]): number {
  const edges = new Set<string>();
  for (const { x, z } of columns) {
    if (x === 0) edges.add("w");
    if (x === draft.width - 1) edges.add("e");
    if (z === 0) edges.add("n");
    if (z === draft.depth - 1) edges.add("s");
  }
  return edges.size;
}

function roadNeighbours(draft: MapDraft, x: number, z: number): number {
  return STEPS.filter(
    ([dx, dz]) =>
      draft.inBounds(x + dx, z + dz) && draft.isRoad(x + dx, z + dz),
  ).length;
}

function hasRampBetween(
  draft: MapDraft,
  a: ColumnCoord,
  b: ColumnCoord,
): boolean {
  return draft.connectors.some(
    (c) =>
      c.kind === "ramp" &&
      ((c.from.x === a.x &&
        c.from.z === a.z &&
        c.to.x === b.x &&
        c.to.z === b.z) ||
        (c.from.x === b.x &&
          c.from.z === b.z &&
          c.to.x === a.x &&
          c.to.z === a.z)),
  );
}

const SEEDS = 12;

describe("RoadPass", () => {
  it("produces one connected, dry network whose segments are level", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const label = `${settlement}/${biome}/${i}`;
          const draft = run(biome, settlement, `net-${i}`);
          const roads = roadColumns(draft);
          expect(roads.length, label).toBeGreaterThan(0);
          expect(components(draft, roads), label).toBe(1);
          for (const { x, z } of roads) {
            expect(draft.groundSurfaceAt(x, z), label).not.toBe(
              SurfaceIds.WATER,
            );
          }
          for (const segment of draft.roads) {
            for (const column of segment.columns) {
              expect(draft.groundLevelAt(column.x, column.z), label).toBe(
                segment.level,
              );
              expect(draft.isRoad(column.x, column.z), label).toBe(true);
            }
          }
        }
      }
    }
  });

  it("crosses the map edge to edge for trails and towns", () => {
    for (const settlement of ["rural", "town"] as const) {
      for (const biome of BIOME_IDS) {
        for (let i = 0; i < SEEDS; i++) {
          const draft = run(biome, settlement, `edge-${i}`);
          expect(
            edgesTouched(draft, roadColumns(draft)),
            `${settlement}/${biome}/${i}`,
          ).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("forms a grid with several crossings in cities", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const draft = run(biome, "city", `grid-${i}`);
        const crossings = roadColumns(draft).filter(
          ({ x, z }) => roadNeighbours(draft, x, z) >= 3,
        ).length;
        expect(crossings, `${biome}/${i}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("grades the plat inside a city grid to one level", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const label = `${biome}/${i}`;
        const draft = run(biome, "city", `plat-${i}`);
        const roads = roadColumns(draft);
        const first = roads[0];
        expect(first, label).toBeDefined();
        if (first === undefined) continue;
        const level = draft.groundLevelAt(first.x, first.z);
        const xs = roads.map((c) => c.x);
        const zs = roads.map((c) => c.z);
        for (let z = Math.min(...zs) - 1; z <= Math.max(...zs) + 1; z++) {
          for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
            if (
              !draft.inBounds(x, z) ||
              draft.groundSurfaceAt(x, z) === SurfaceIds.WATER
            ) {
              continue;
            }
            expect(draft.groundLevelAt(x, z), `${label} at ${x},${z}`).toBe(
              level,
            );
          }
        }
      }
    }
  });

  it("never leaves a step along a road without a ramp", () => {
    for (const settlement of SETTLEMENT_SCALES) {
      for (let i = 0; i < SEEDS; i++) {
        const draft = run("snowy", settlement, `step-${i}`);
        for (const { x, z } of roadColumns(draft)) {
          const level = draft.groundLevelAt(x, z);
          for (const [dx, dz] of STEPS) {
            const nx = x + dx;
            const nz = z + dz;
            if (!draft.inBounds(nx, nz) || !draft.isRoad(nx, nz)) continue;
            const diff = Math.abs(draft.groundLevelAt(nx, nz) - level);
            expect(diff, `${settlement}/${i} at ${x},${z}`).toBeLessThanOrEqual(
              1,
            );
            if (diff === 1) {
              expect(
                hasRampBetween(draft, { x, z }, { x: nx, z: nz }),
                `${settlement}/${i} ramp at ${x},${z}`,
              ).toBe(true);
            }
          }
        }
      }
    }
  });

  it("paints paved roads with sidewalks in towns and cities, dirt trails in the country", () => {
    const town = run("temperate", "town", "paint");
    const roads = roadColumns(town);
    expect(
      roads.every(({ x, z }) => town.groundSurfaceAt(x, z) === SurfaceIds.ROAD),
    ).toBe(true);
    let sidewalks = 0;
    for (let z = 0; z < town.depth; z++) {
      for (let x = 0; x < town.width; x++) {
        if (town.groundSurfaceAt(x, z) === SurfaceIds.SIDEWALK) {
          sidewalks++;
          expect(roadNeighbours(town, x, z)).toBeGreaterThan(0);
        }
      }
    }
    expect(sidewalks).toBeGreaterThan(0);

    const rural = run("temperate", "rural", "paint");
    expect(
      roadColumns(rural).every(
        ({ x, z }) => rural.groundSurfaceAt(x, z) === SurfaceIds.DIRT,
      ),
    ).toBe(true);
    for (let z = 0; z < rural.depth; z++) {
      for (let x = 0; x < rural.width; x++) {
        expect(rural.groundSurfaceAt(x, z)).not.toBe(SurfaceIds.SIDEWALK);
      }
    }
  });

  it("scales to large maps and stays deterministic", () => {
    const a = roadColumns(run("coastal", "city", "big", "large"));
    const b = roadColumns(run("coastal", "city", "big", "large"));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(100);
  });
});
