import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../data/surfaces";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import { createDefaultRegistries } from "../service/default-registries";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

const registries = createDefaultRegistries();

function params(biome: MapGenParams["biome"]): MapGenParams {
  return {
    archetype: "settlement",
    biome,
    settlement: "town",
    size: "small",
    hooks: [],
  };
}

function run(
  biome: MapGenParams["biome"],
  seed: string,
): { draft: MapDraft; notes: string[] } {
  const generator = new PipelineMapGenerator(
    [new TerrainPass(), new WaterPass()],
    registries,
  );
  const result = generator.run(
    params(biome),
    new Mulberry32Rng(hashSeed(seed)),
  );
  return {
    draft: result.draft,
    notes: result.diagnostics.notes
      .filter((n) => n.pass === "water")
      .map((n) => n.message),
  };
}

function waterColumns(draft: MapDraft): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      if (draft.groundSurfaceAt(x, z) === SurfaceIds.WATER) {
        out.push({ x, z });
      }
    }
  }
  return out;
}

/** Number of 4-connected components among the given columns. */
function components(
  draft: MapDraft,
  columns: { x: number; z: number }[],
): number {
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
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const nz = z + dz;
        if (!draft.inBounds(nx, nz)) continue;
        const nk = key(nx, nz);
        if (members.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
  }
  return count;
}

/**
 * Edges whose every boundary column is water. A band along one edge also
 * touches the two neighbouring edges at its corners, so "one full edge and
 * a dry opposite edge" is the meaningful check.
 */
function fullEdges(
  draft: MapDraft,
  columns: { x: number; z: number }[],
): string[] {
  const water = new Set(columns.map((c) => c.z * draft.width + c.x));
  const isWater = (x: number, z: number): boolean =>
    water.has(z * draft.width + x);
  const full: string[] = [];
  const xs = [...Array(draft.width).keys()];
  const zs = [...Array(draft.depth).keys()];
  if (zs.every((z) => isWater(0, z))) full.push("w");
  if (zs.every((z) => isWater(draft.width - 1, z))) full.push("e");
  if (xs.every((x) => isWater(x, 0))) full.push("n");
  if (xs.every((x) => isWater(x, draft.depth - 1))) full.push("s");
  return full;
}

const OPPOSITE: Readonly<Record<string, string>> = {
  w: "e",
  e: "w",
  n: "s",
  s: "n",
};

function edgeHasWater(draft: MapDraft, edge: string): boolean {
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const onEdge =
        (edge === "w" && x === 0) ||
        (edge === "e" && x === draft.width - 1) ||
        (edge === "n" && z === 0) ||
        (edge === "s" && z === draft.depth - 1);
      if (onEdge && draft.groundSurfaceAt(x, z) === SurfaceIds.WATER) {
        return true;
      }
    }
  }
  return false;
}

describe("WaterPass", () => {
  it("floods one contiguous band along exactly one edge on coastal maps", () => {
    for (let i = 0; i < 40; i++) {
      const { draft } = run("coastal", `coast-${i}`);
      const water = waterColumns(draft);
      const fraction = water.length / (draft.width * draft.depth);
      expect(fraction, `seed ${i}`).toBeGreaterThanOrEqual(0.15);
      expect(fraction, `seed ${i}`).toBeLessThanOrEqual(0.4);
      expect(components(draft, water), `seed ${i}`).toBe(1);
      const full = fullEdges(draft, water);
      expect(full, `seed ${i}`).toHaveLength(1);
      expect(
        edgeHasWater(draft, OPPOSITE[full[0] ?? ""] ?? ""),
        `seed ${i}`,
      ).toBe(false);
      for (const { x, z } of water) {
        expect(draft.groundLevelAt(x, z)).toBe(0);
      }
    }
  });

  it("lays a sand beach just inland of the water", () => {
    const { draft } = run("coastal", "beach");
    let sand = 0;
    for (let z = 0; z < draft.depth; z++) {
      for (let x = 0; x < draft.width; x++) {
        if (draft.groundSurfaceAt(x, z) === SurfaceIds.SAND) sand++;
      }
    }
    expect(sand).toBeGreaterThan(0);
  });

  it("picks different edges across seeds", () => {
    const edges = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const { draft } = run("coastal", `edge-${i}`);
      edges.add(fullEdges(draft, waterColumns(draft)).join(""));
    }
    expect(edges.size).toBeGreaterThan(1);
  });

  it("leaves non-coastal biomes without water", () => {
    for (const biome of ["temperate", "snowy", "desert"] as const) {
      const { draft, notes } = run(biome, "dry");
      expect(waterColumns(draft)).toHaveLength(0);
      expect(notes[0]).toMatch(/no shoreline/);
    }
  });

  it("is deterministic per seed", () => {
    const a = waterColumns(run("coastal", "same").draft);
    const b = waterColumns(run("coastal", "same").draft);
    expect(a).toEqual(b);
  });
});
