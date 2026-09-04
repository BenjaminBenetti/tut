import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { BIOME_DEFINITIONS } from "../data/biomes";
import type { BiomeDefinition } from "../model/biome-definition";
import type { MapDraft } from "../model/map-draft";
import type { MapGenParams } from "../model/map-recipe";
import type { MapGenRegistries } from "../model/registries";
import { createDefaultRegistries } from "../service/default-registries";
import { createRegistry } from "../../core/service/definition-registry";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { TerrainPass } from "./terrain-pass";

const registries = createDefaultRegistries();

function params(biome: string): MapGenParams {
  return {
    archetype: "settlement",
    biome: biome as MapGenParams["biome"],
    settlement: "town",
    size: "small",
    hooks: [],
  };
}

function terrain(
  biome: string,
  seed: string,
  regs: MapGenRegistries = registries,
): MapDraft {
  const generator = new PipelineMapGenerator([new TerrainPass()], regs);
  return generator.run(params(biome), new Mulberry32Rng(hashSeed(seed))).draft;
}

function levels(draft: MapDraft): number[] {
  const out: number[] = [];
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      out.push(draft.groundLevelAt(x, z));
    }
  }
  return out;
}

/** Fraction of 4-neighbour edges whose level difference is at most one. */
function smoothEdgeFraction(draft: MapDraft): number {
  let edges = 0;
  let smooth = 0;
  for (let z = 0; z < draft.depth; z++) {
    for (let x = 0; x < draft.width; x++) {
      const here = draft.groundLevelAt(x, z);
      if (x + 1 < draft.width) {
        edges++;
        if (Math.abs(here - draft.groundLevelAt(x + 1, z)) <= 1) smooth++;
      }
      if (z + 1 < draft.depth) {
        edges++;
        if (Math.abs(here - draft.groundLevelAt(x, z + 1)) <= 1) smooth++;
      }
    }
  }
  return smooth / edges;
}

describe("TerrainPass", () => {
  it("keeps every column inside the biome's level range and palette", () => {
    for (const biome of BIOME_IDS) {
      const definition = BIOME_DEFINITIONS[biome];
      const palette = new Set(definition.groundSurfaces.map((s) => s.surface));
      for (let i = 0; i < 12; i++) {
        const draft = terrain(biome, `${biome}-${i}`);
        for (let z = 0; z < draft.depth; z++) {
          for (let x = 0; x < draft.width; x++) {
            const level = draft.groundLevelAt(x, z);
            expect(level).toBeGreaterThanOrEqual(0);
            expect(level).toBeLessThanOrEqual(
              definition.terrain.amplitudeLevels,
            );
            expect(palette.has(draft.groundSurfaceAt(x, z))).toBe(true);
          }
        }
      }
    }
  });

  it("is smooth: adjacent columns differ by at most one level almost everywhere", () => {
    for (let i = 0; i < 50; i++) {
      const draft = terrain("snowy", `smooth-${i}`);
      expect(smoothEdgeFraction(draft)).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("actually uses more than one level and more than one surface", () => {
    for (let i = 0; i < 10; i++) {
      const draft = terrain("temperate", `variety-${i}`);
      expect(new Set(levels(draft)).size, `seed ${i}`).toBeGreaterThan(1);
      const surfaces = new Set<string>();
      for (let z = 0; z < draft.depth; z++) {
        for (let x = 0; x < draft.width; x++) {
          surfaces.add(draft.groundSurfaceAt(x, z));
        }
      }
      expect(surfaces.size, `seed ${i}`).toBeGreaterThan(1);
    }
  });

  it("is deterministic per seed and differs across seeds", () => {
    expect(levels(terrain("desert", "a"))).toEqual(
      levels(terrain("desert", "a")),
    );
    expect(levels(terrain("desert", "a"))).not.toEqual(
      levels(terrain("desert", "b")),
    );
  });

  it("flattens the map when the biome has no amplitude", () => {
    const flat: BiomeDefinition = {
      ...BIOME_DEFINITIONS.temperate,
      id: "temperate",
      terrain: { ...BIOME_DEFINITIONS.temperate.terrain, amplitudeLevels: 0 },
    };
    const regs: MapGenRegistries = {
      ...registries,
      biomes: createRegistry("biome", [flat]),
    };
    const draft = terrain("temperate", "flat", regs);
    expect(levels(draft).every((level) => level === 0)).toBe(true);
  });

  it("leaves a diagnostic note", () => {
    const generator = new PipelineMapGenerator([new TerrainPass()], registries);
    const { diagnostics } = generator.run(
      params("coastal"),
      new Mulberry32Rng(hashSeed("note")),
    );
    expect(diagnostics.notes[0]?.pass).toBe("terrain");
    expect(diagnostics.notes[0]?.message).toMatch(/terrain up to level/);
  });
});
