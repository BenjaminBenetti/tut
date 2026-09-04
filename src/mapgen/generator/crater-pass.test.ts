import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { PassMask } from "../model/pass-mask";
import type { MapGenParams } from "../model/map-recipe";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { BIOME_DEFINITIONS } from "../data/biomes";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SurfaceIds } from "../data/surfaces";
import { MapDraft } from "../model/map-draft";
import { DiagnosticsCollector } from "../service/diagnostics-collector";
import { createDefaultRegistries } from "../service/default-registries";
import { CraterPass } from "./crater-pass";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { ReachabilityService } from "../service/reachability-service";
import { TileIndex } from "../service/tile-index";
import { validateTacticalMap } from "../service/map-validator";

const registries = createDefaultRegistries();
const SEEDS = 3;

/** The level a flat draft sits on once the pass has lifted it (depth 2). */
const CRATER_RIM = 2;

function params(biome: MapGenParams["biome"]): MapGenParams {
  return {
    archetype: "crash-site",
    biome,
    settlement: "rural",
    size: "medium",
    hooks: DEFAULT_MISSION_HOOKS,
  };
}

describe("crash-site archetype (prototype)", () => {
  it("generates a valid map for every biome", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const label = `${biome}/${i}`;
        const map = generateTacticalMap(
          { seed: `crater-${label}`, params: params(biome) },
          { registries },
        );
        expect(validateTacticalMap(map, registries), label).toEqual([]);
        expect(map.props.length, label).toBeGreaterThan(0);
        expect(map.hooks.objectives.length, label).toBeGreaterThan(0);
      }
    }
  }, 30_000);

  it("terraces the bowl, so every step in it is climbable", () => {
    // Run on flat ground rather than through the pipeline: a generated
    // map has its own cliffs, and this is a question about the bowl.
    for (let seed = 0; seed < 6; seed++) {
      const draft = new MapDraft(
        48,
        48,
        new SequentialIdGenerator(),
        SurfaceIds.GRASS,
      );
      const diagnostics = new DiagnosticsCollector();
      new CraterPass().run({
        params: {
          archetype: "crash-site",
          width: draft.width,
          depth: draft.depth,
          biome: BIOME_DEFINITIONS.temperate,
          settlement: SETTLEMENT_DEFINITIONS.rural,
          hooks: [],
        },
        rng: new Mulberry32Rng(hashSeed(`bowl-${String(seed)}`)),
        draft,
        registries,
        diagnostics: diagnostics.forPass("crater"),
      });

      let sunk = 0;
      for (let z = 0; z < draft.depth; z++) {
        for (let x = 0; x < draft.width; x++) {
          const level = draft.groundLevelAt(x, z);
          if (level < CRATER_RIM) {
            sunk++;
          }
          for (const [dx, dz] of [
            [1, 0],
            [0, 1],
          ] as const) {
            if (!draft.inBounds(x + dx, z + dz)) {
              continue;
            }
            const other = draft.groundLevelAt(x + dx, z + dz);
            expect(
              Math.abs(other - level),
              `seed ${String(seed)} at ${String(x)},${String(z)}`,
            ).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(sunk, `seed ${String(seed)}`).toBeGreaterThan(100);
    }
  }, 30_000);

  it("leaves the crater floor reachable from the deploy zone", () => {
    for (const biome of BIOME_IDS) {
      const map = generateTacticalMap(
        { seed: `floor-${biome}`, params: params(biome) },
        { registries },
      );
      const index = new TileIndex(map);
      const reach = new ReachabilityService(index, map.connectors);
      const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
      const walkable = reach.reachableFrom(deploy, PassMask.INFANTRY);
      const lowest = Math.min(
        ...map.tiles
          .filter((tile) => tile.buildingId === undefined)
          .map((tile) => tile.y),
      );
      const floorTiles = map.tiles.filter(
        (tile) => tile.y === lowest && (tile.pass & PassMask.INFANTRY) !== 0,
      );
      const reachableFloor = floorTiles.filter((tile) =>
        walkable.has(index.keyOf(tile)),
      );
      expect(floorTiles.length, biome).toBeGreaterThan(0);
      expect(reachableFloor.length / floorTiles.length, biome).toBeGreaterThan(
        0.5,
      );
    }
  }, 30_000);
});
