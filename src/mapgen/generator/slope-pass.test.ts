import { STOREY_LAYERS } from "../../core/model/elevation";
import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { DIRECTIONS } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { stepGridPos } from "../../core/service/grid-math";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import type { MapGenParams } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";
import type { Tile } from "../model/tile";
import { createDefaultRegistries } from "../service/default-registries";
import {
  generateTacticalMap,
  generateTacticalMapWithDiagnostics,
} from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { ReachabilityService } from "../service/reachability-service";
import { createSettlementPasses } from "../service/settlement-pipeline";
import { computeMapMetrics } from "../service/map-metrics";
import { TileIndex } from "../service/tile-index";
import { SlopePass } from "./slope-pass";

const registries = createDefaultRegistries();
const SEEDS = 3;

function params(
  settlement: MapGenParams["settlement"],
  biome: MapGenParams["biome"],
  slopeShare?: number,
): MapGenParams {
  return {
    archetype: "settlement",
    biome,
    settlement,
    size: "medium",
    hooks: DEFAULT_MISSION_HOOKS,
    ...(slopeShare === undefined ? {} : { slopeShare }),
  };
}

/** Ground tiles one level below an orthogonal ground neighbour, with no wall between. */
function unwalledSteps(
  map: ReturnType<typeof generateTacticalMap>,
  index: TileIndex,
): { lower: Tile; upper: Tile }[] {
  const steps: { lower: Tile; upper: Tile }[] = [];
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined) continue;
    for (const side of DIRECTIONS) {
      if (tile.walls[side] !== undefined) continue;
      const next = stepGridPos(tile, side);
      const upper = index.get(next.x, tile.y + STOREY_LAYERS, next.z);
      if (upper !== undefined && upper.buildingId === undefined) {
        steps.push({ lower: tile, upper });
      }
    }
  }
  return steps;
}

describe("SlopePass", () => {
  it("runs after props and before ramps", () => {
    const pass = new SlopePass();
    expect(pass.id).toBe("slopes");
    expect(pass.requires).toEqual(["props"]);
    expect(pass.provides).toEqual(["slopes"]);
    const ids = createSettlementPasses().map((p) => p.id);
    expect(ids.indexOf("slopes")).toBe(ids.indexOf("ramps") - 1);
  });

  it("makes every rural terrain step a slope at the default share, and none at zero", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const seed = `slopes-${biome}-${i}`;
        const all = generateTacticalMap(
          { seed, params: params("rural", biome) },
          { registries },
        );
        const none = generateTacticalMap(
          { seed, params: params("rural", biome, 0) },
          { registries },
        );
        // Rural has no plats, lots aside: every unwalled step away from a
        // building is natural terrain.
        const index = new TileIndex(all);
        const steps = unwalledSteps(all, index).filter(
          ({ lower, upper }) =>
            !all.buildings.some((b) => {
              const fp = b.footprint[0];
              if (fp === undefined) return false;
              const near = (t: Tile): boolean =>
                t.x >= fp.x - 1 &&
                t.x <= fp.x + fp.w &&
                t.z >= fp.z - 1 &&
                t.z <= fp.z + fp.d;
              return near(lower) || near(upper);
            }),
        );
        if (steps.length === 0) continue;
        // Not every unwalled step can carry a wedge: a prop on either tile
        // takes it out of the walkable graph, a graded trail column or a
        // lot's edge is man-made by the ruling, and a one-wide gully or a
        // pit has no wedge shape. Measured 281 of 339 on temperate/0 with
        // those accounting for the rest, and coastal/0 the low end at 0.70
        // (water edges are not walkable steps, props are denser). The
        // pass's own note is the exact number and is asserted below.
        const sloped = steps.filter(({ lower }) => lower.slope !== undefined);
        expect(
          sloped.length / steps.length,
          `${seed} share`,
        ).toBeGreaterThanOrEqual(0.6);
        const note =
          generateTacticalMapWithDiagnostics(
            { seed, params: params("rural", biome) },
            { registries },
          ).diagnostics.notes.find((n) => n.pass === "slopes")?.message ?? "";
        expect(note, `${seed} note`).toMatch(/\(100 %\)/);
        expect(
          none.tiles.filter((t) => t.slope !== undefined),
          `${seed} at share 0`,
        ).toHaveLength(0);
        // The Map Lab metric reads the knob back exactly (#801 review):
        // every natural edge is frozen as one whether sloped or not.
        expect(computeMapMetrics(all).slopeShare, `${seed} metric at 1`).toBe(
          1,
        );
        if (all.tiles.some((t) => t.naturalEdge === true)) {
          expect(
            computeMapMetrics(none).slopeShare,
            `${seed} metric at 0`,
          ).toBe(0);
        }
      }
    }
  });

  it("gives every straight and inner slope a connector both classes can walk both ways", () => {
    for (const biome of BIOME_IDS) {
      const map = generateTacticalMap(
        { seed: `walk-${biome}`, params: params("town", biome) },
        { registries },
      );
      const index = new TileIndex(map);
      const reach = new ReachabilityService(index, map.connectors);
      let checked = 0;
      for (const tile of map.tiles) {
        if (tile.slope === undefined || tile.slope.kind === "outer") continue;
        const ups = map.connectors.filter(
          (c) =>
            c.kind === "ramp" &&
            c.from.x === tile.x &&
            c.from.z === tile.z &&
            c.from.y === tile.y,
        );
        expect(ups.length, `${biome} slope at ${tile.x},${tile.z}`).toBe(
          tile.slope.kind === "inner" ? 2 : 1,
        );
        for (const up of ups) {
          const upper = index.getAt(up.to);
          expect(upper, `${biome} upper ${up.id}`).toBeDefined();
          if (upper === undefined) continue;
          for (const mask of [PassMask.INFANTRY, PassMask.MECH]) {
            expect(
              reach.neighbours(tile, mask).some((n) => n === upper),
              `${biome} ${up.id} up`,
            ).toBe(true);
            expect(
              reach.neighbours(upper, mask).some((n) => n === tile),
              `${biome} ${up.id} down`,
            ).toBe(true);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it("never slopes a man-made edge: plats, features and lots keep their walls", () => {
    for (let i = 0; i < SEEDS; i++) {
      const map = generateTacticalMap(
        { seed: `city-${i}`, params: params("city", "temperate") },
        { registries },
      );
      // Elevated features rail every raised edge with a parapet (#607); a
      // slope tile never carries one and never sits beside a building.
      for (const tile of map.tiles) {
        if (tile.slope === undefined) continue;
        expect(
          Object.keys(tile.walls),
          `slope with a wall at ${tile.x},${tile.z}`,
        ).toHaveLength(0);
        for (const b of map.buildings) {
          const fp = b.footprint[0];
          if (fp === undefined) continue;
          const touching =
            tile.x >= fp.x - 1 &&
            tile.x <= fp.x + fp.w &&
            tile.z >= fp.z - 1 &&
            tile.z <= fp.z + fp.d;
          expect(touching, `slope beside ${b.id} at ${tile.x},${tile.z}`).toBe(
            false,
          );
        }
      }
    }
  });

  it("leaves no orphan corner: every corner piece has its flanking straights", () => {
    for (const biome of BIOME_IDS) {
      for (let i = 0; i < SEEDS; i++) {
        const map = generateTacticalMap(
          {
            seed: `corners-${biome}-${i}`,
            params: params("rural", biome, 0.5),
          },
          { registries },
        );
        const index = new TileIndex(map);
        for (const tile of map.tiles) {
          if (tile.slope?.kind !== "outer") continue;
          // An outer corner's two orthogonal neighbours towards its high
          // diagonal are straights on the same level.
          const flanks = DIRECTIONS.map((d) => {
            const s = stepGridPos(tile, d);
            return index.get(s.x, tile.y, s.z);
          }).filter(
            (t): t is Tile => t !== undefined && t.slope?.kind === "straight",
          );
          expect(
            flanks.length,
            `${biome}/${i} outer at ${tile.x},${tile.z}`,
          ).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("is deterministic per seed and rerolls nothing else", () => {
    const without = new PipelineMapGenerator(
      createSettlementPasses().filter((p) => p.id !== "slopes"),
      registries,
    );
    const seed = hashSeed("slopes-det");
    const a = without.run(
      params("rural", "temperate"),
      new Mulberry32Rng(seed),
    ).draft;
    const b = new PipelineMapGenerator(
      createSettlementPasses(),
      registries,
    ).run(params("rural", "temperate"), new Mulberry32Rng(seed)).draft;
    // Slopes add connectors and pieces; they move no ground and no prop.
    for (let z = 0; z < a.depth; z++) {
      for (let x = 0; x < a.width; x++) {
        expect(b.groundLevelAt(x, z)).toBe(a.groundLevelAt(x, z));
      }
    }
    expect(b.props).toEqual(a.props);
  });
});
