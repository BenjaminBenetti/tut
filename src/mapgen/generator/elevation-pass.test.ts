import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { DIRECTIONS } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SurfaceIds } from "../data/surfaces";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import { createDefaultRegistries } from "../service/default-registries";
import { ReachabilityService } from "../service/reachability-service";
import { TileIndex } from "../service/tile-index";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { ElevationPass } from "./elevation-pass";
import { LotPass } from "./lot-pass";
import { RoadPass } from "./road-pass";
import { TerrainPass } from "./terrain-pass";
import { WaterPass } from "./water-pass";

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

  it("rails the edge of what it raises, without shutting a mech out (#508)", () => {
    for (let i = 0; i < SEEDS; i++) {
      const label = `seed ${String(i)}`;
      const map = generateTacticalMap(
        { seed: `parapet-${String(i)}`, params: params("city") },
        { registries },
      );
      const index = new TileIndex(map);
      const levels = new Map<number, number>();
      for (const tile of map.tiles) {
        if (tile.buildingId === undefined) {
          levels.set(tile.y, (levels.get(tile.y) ?? 0) + 1);
        }
      }
      const base = [...levels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      // A raised tile has no same-level neighbour on the side it drops
      // away, so the rail is read off the tile's own edges.
      const railed = map.tiles
        .filter(
          (tile) =>
            base !== undefined &&
            tile.y > base &&
            tile.buildingId === undefined,
        )
        .reduce(
          (count, tile) =>
            count +
            DIRECTIONS.filter((side) => tile.walls[side] === "half").length,
          0,
        );
      expect(railed, label).toBeGreaterThan(0);

      // The rails are infantry-only, so a mech has to use the ramps — but
      // it must still be able to get up there.
      const reach = new ReachabilityService(index, map.connectors);
      const deploy = map.hooks.deployZones.flatMap((zone) => zone.tiles);
      const mech = reach.reachableFrom(deploy, PassMask.MECH);
      const highMech = map.tiles.filter(
        (tile) =>
          base !== undefined &&
          tile.y > base &&
          tile.buildingId === undefined &&
          mech.has(index.keyOf(tile)),
      ).length;
      expect(highMech, `${label} mech-reachable high ground`).toBeGreaterThan(
        20,
      );
    }
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

  /**
   * #762: a raised plat against a house whose ground is a level up sits at
   * its second floor and reads as a floor with grass on it. So no feature
   * stands within a column of any lot, on any side. Exact rather than
   * inferred: the same seed with and without the pass must agree on the
   * ground level of every column in the ring around every lot.
   */
  it("keeps every raised feature at least one column clear of every lot", () => {
    const upToLots = [
      new TerrainPass(),
      new WaterPass(),
      new RoadPass(),
      new LotPass(),
    ];
    const before = new PipelineMapGenerator(upToLots, registries);
    const after = new PipelineMapGenerator(
      [...upToLots, new ElevationPass()],
      registries,
    );
    let checked = 0;
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const seed = new Mulberry32Rng(
          hashSeed(`lot-margin-${biome}-${String(i)}`),
        );
        const seedAgain = new Mulberry32Rng(
          hashSeed(`lot-margin-${biome}-${String(i)}`),
        );
        const flat = before.run(params("city", biome), seed).draft;
        const raised = after.run(params("city", biome), seedAgain).draft;
        for (const lot of raised.lots) {
          const { x, z, w, d } = lot.rect;
          for (let zz = z - 1; zz < z + d + 1; zz++) {
            for (let xx = x - 1; xx < x + w + 1; xx++) {
              if (!raised.inBounds(xx, zz)) continue;
              checked++;
              expect(
                raised.groundLevelAt(xx, zz),
                `${biome}/${String(i)} column (${String(xx)},${String(zz)}) beside ${lot.id}`,
              ).toBe(flat.groundLevelAt(xx, zz));
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
