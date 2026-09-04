import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SurfaceIds } from "../data/surfaces";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "../service/default-registries";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { ElevationPass } from "./elevation-pass";

const registries = createDefaultRegistries();
const generator = new PipelineMapGenerator(
  createSettlementPasses(),
  registries,
);

function params(
  settlement: MapGenParams["settlement"],
  biome: MapGenParams["biome"] = "temperate",
): MapGenParams {
  return {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks: DEFAULT_MISSION_HOOKS,
  };
}

const SEEDS = 4;

describe("ElevationPass", () => {
  it("runs between lots and buildings", () => {
    const pass = new ElevationPass();
    expect(pass.id).toBe("elevation");
    expect(pass.requires).toEqual(["roads", "lots"]);
    expect(pass.provides).toEqual(["elevation"]);
  });

  it("gives a city outdoor ground a mech can stand on above the plat", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const label = `${biome}/${i}`;
        const map = generateTacticalMap(
          { seed: `elevated-${label}`, params: params("city", biome) },
          { registries },
        );
        const levels = new Map<number, number>();
        for (const tile of map.tiles) {
          if (tile.buildingId === undefined) {
            levels.set(tile.y, (levels.get(tile.y) ?? 0) + 1);
          }
        }
        const base = [...levels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const mechHigh = map.tiles.filter(
          (tile) =>
            tile.buildingId === undefined &&
            base !== undefined &&
            tile.y > base &&
            (tile.pass & PassMask.MECH) === PassMask.MECH,
        ).length;
        // City plats are graded flat, so this was zero on every seed
        // before the pass (#444). The share is tuned against the band in
        // the sweep; here the point is that outdoor height exists at all
        // and that a mech is allowed on it.
        expect(mechHigh, label).toBeGreaterThan(60);
      }
    }
  });

  it("leaves every step it makes climbable, never a cliff", () => {
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = generator.run(
        params("city"),
        new Mulberry32Rng(hashSeed(`cliffs-${i}`)),
      );
      for (let z = 0; z < draft.depth; z++) {
        for (let x = 0; x + 1 < draft.width; x++) {
          const rise = Math.abs(
            draft.groundLevelAt(x, z) - draft.groundLevelAt(x + 1, z),
          );
          expect(rise, `${x},${z} seed ${i}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("never raises a lot, so buildings keep flat ground", () => {
    for (let i = 0; i < SEEDS; i++) {
      const { draft } = generator.run(
        params("city"),
        new Mulberry32Rng(hashSeed(`lots-${i}`)),
      );
      for (const lot of draft.lots) {
        for (let z = lot.rect.z; z < lot.rect.z + lot.rect.d; z++) {
          for (let x = lot.rect.x; x < lot.rect.x + lot.rect.w; x++) {
            expect(draft.groundLevelAt(x, z), `lot ${lot.id}`).toBe(lot.level);
          }
        }
      }
    }
  });

  it("lifts carriageway and leaves every footway at the level it was", () => {
    // A door opens onto the footway, so lifting that would strand the
    // frontages along the run. Compared against the same seed generated
    // without the pass: each pass draws from its own rng fork, so the
    // road pass lays exactly the same streets either way.
    const without = new PipelineMapGenerator(
      createSettlementPasses().filter((pass) => pass.id !== "elevation"),
      registries,
    );
    let raisedRoad = 0;
    for (let i = 0; i < SEEDS; i++) {
      const seed = hashSeed(`street-${i}`);
      const flat = without.run(params("city"), new Mulberry32Rng(seed)).draft;
      const lifted = generator.run(
        params("city"),
        new Mulberry32Rng(seed),
      ).draft;
      for (let z = 0; z < flat.depth; z++) {
        for (let x = 0; x < flat.width; x++) {
          const before = flat.groundLevelAt(x, z);
          const after = lifted.groundLevelAt(x, z);
          if (flat.groundSurfaceAt(x, z) === SurfaceIds.SIDEWALK) {
            expect(after, `footway ${x},${z} seed ${i}`).toBe(before);
          }
          if (flat.isRoad(x, z) && after > before) {
            raisedRoad++;
          }
        }
      }
    }
    expect(raisedRoad).toBeGreaterThan(0);
  });

  it("leaves a settlement without the knob alone", () => {
    for (const settlement of ["rural", "town"] as const) {
      const { draft, diagnostics } = generator.run(
        params(settlement),
        new Mulberry32Rng(hashSeed(`quiet-${settlement}`)),
      );
      expect(
        diagnostics.notes.filter((note) => note.pass === "elevation"),
        settlement,
      ).toEqual([]);
      expect(draft.lots.length).toBeGreaterThan(0);
    }
  });
});
