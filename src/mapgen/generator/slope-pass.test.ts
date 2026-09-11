import { describe, expect, it } from "vitest";

import { BIOME_IDS } from "../../content/model/biome-id";
import { DIRECTIONS, type Direction } from "../../core/model/direction";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";
import { stepGridPos } from "../../core/service/grid-math";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SurfaceIds } from "../data/surfaces";
import type { GenerationPass } from "../model/generation-pass";
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
      const upper = index.get(next.x, tile.y + 1, next.z);
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
          `${seed} share ${String(sloped.length)}/${String(steps.length)}`,
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

  it("makes every straight and inner slope a free walk both ways for both classes, with no connector", () => {
    const ring: readonly Direction[] = ["s", "w", "n", "e"];
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
        // Shape only (ADR 0008 §2.3): nothing starts on a slope tile.
        expect(
          map.connectors.some(
            (c) => c.from.x === tile.x && c.from.z === tile.z,
          ),
          `${biome} connector from slope at ${tile.x},${tile.z}`,
        ).toBe(false);
        const sides =
          tile.slope.kind === "straight"
            ? [ring[tile.slope.turns]]
            : [ring[tile.slope.turns], ring[(tile.slope.turns + 1) % 4]];
        for (const side of sides) {
          if (side === undefined) continue;
          const step = stepGridPos(tile, side);
          const upper = index.get(step.x, tile.y + 1, step.z);
          expect(
            upper,
            `${biome} high side ${side} of ${tile.x},${tile.z}`,
          ).toBeDefined();
          if (upper === undefined) continue;
          for (const mask of [PassMask.INFANTRY, PassMask.MECH]) {
            // A prop on either tile takes it out of the graph; the shape
            // is still right (#817), the walk is around it.
            if ((tile.pass & mask) === 0 || (upper.pass & mask) === 0) {
              continue;
            }
            expect(
              reach.neighbours(tile, mask).some((n) => n === upper),
              `${biome} up ${side} at ${tile.x},${tile.z}`,
            ).toBe(true);
            expect(
              reach.neighbours(upper, mask).some((n) => n === tile),
              `${biome} down ${side} at ${tile.x},${tile.z}`,
            ).toBe(true);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  /**
   * #817: the Executive Director saw concave corners left unfilled. The
   * case the Director named: a high neighbour carrying a prop. A prop
   * takes the tile out of the walkable graph, and the old classification
   * read walkability, so the corner tile saw one high side and became a
   * straight, leaving the notch open. Shape is read from levels now.
   */
  it("classifies a concave corner as inner even when a high neighbour carries a prop (#817)", () => {
    const registries = createDefaultRegistries();
    /** A 16×16 plat at layer 0 with a raised L: the north row and east column at layer 1. */
    const shapePass: GenerationPass = {
      id: "shape",
      requires: [],
      provides: [
        "heightmap",
        "water",
        "roads",
        "lots",
        "elevation",
        "buildings",
        "interiors",
        "props",
      ],
      run: ({ draft }) => {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            const high = z === 0 || x === 15;
            draft.setGroundLevel(x, z, high ? 1 : 0);
            draft.setNaturalLevel(x, z, high ? 1 : 0);
            draft.setGroundSurface(x, z, SurfaceIds.GRASS);
          }
        }
        // The boulder stands on the high tile east of the corner tile.
        draft.addProp("boulder", draft.groundCoord(15, 1));
      },
    };
    const pipeline = new PipelineMapGenerator(
      [shapePass, new SlopePass()],
      registries,
    );
    const { draft } = pipeline.run(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: { width: 16, depth: 16 },
        hooks: [],
      },
      new Mulberry32Rng(hashSeed("817")),
    );
    // (14,1) has high ground north (14,0) and east (15,1) — the east tile
    // carries the boulder. It is the concave corner and must be `inner`.
    expect(draft.slopeAt(14, 1)).toEqual({ kind: "inner", turns: 2 });
    // Its neighbours along each run are straights facing their high side.
    expect(draft.slopeAt(13, 1)?.kind).toBe("straight");
    expect(draft.slopeAt(14, 2)?.kind).toBe("straight");
    // And a boulder on the *lower* tile does not unmake the wedge either.
    const withLowProp: GenerationPass = {
      ...shapePass,
      id: "shape2",
      run: (ctx) => {
        shapePass.run(ctx);
        ctx.draft.addProp("boulder", ctx.draft.groundCoord(3, 1));
      },
    };
    const again = new PipelineMapGenerator(
      [withLowProp, new SlopePass()],
      registries,
    ).run(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: { width: 16, depth: 16 },
        hooks: [],
      },
      new Mulberry32Rng(hashSeed("817b")),
    ).draft;
    expect(again.slopeAt(3, 1)?.kind).toBe("straight");
    // The Art Director's second finding: a pine on the high *diagonal*
    // removed every outer corner. Here the raised L's convex corner is the
    // high tile (15,0); the outer piece belongs on (14,1)'s diagonal
    // partner across it — build a jut instead: a single high tile.
    const jut: GenerationPass = {
      id: "jut",
      requires: [],
      provides: shapePass.provides,
      run: ({ draft }) => {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            const high = z <= 1 && x >= 8;
            draft.setGroundLevel(x, z, high ? 1 : 0);
            draft.setNaturalLevel(x, z, high ? 1 : 0);
            draft.setGroundSurface(x, z, SurfaceIds.GRASS);
          }
        }
        // The pine stands on the high corner tile itself.
        draft.addProp("tree-pine", draft.groundCoord(8, 1));
      },
    };
    const jutted = new PipelineMapGenerator(
      [jut, new SlopePass()],
      registries,
    ).run(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "rural",
        size: { width: 16, depth: 16 },
        hooks: [],
      },
      new Mulberry32Rng(hashSeed("817c")),
    ).draft;
    // (7,2) has no high orthogonal neighbour, a high diagonal at (8,1)
    // carrying the pine, and straights either side: (7,1) climbs east and
    // (8,2) climbs north. It is the outer corner.
    expect(jutted.slopeAt(7, 1)?.kind).toBe("straight");
    expect(jutted.slopeAt(8, 2)?.kind).toBe("straight");
    expect(jutted.slopeAt(7, 2)).toEqual({ kind: "outer", turns: 2 });
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
    // Boundary and yard placement consume slope classification. Exclude both
    // consumers to isolate what the slope pass itself changes (#917/#960).
    const passes = createSettlementPasses().filter(
      (p) => p.id !== "rural-fences" && p.id !== "yard-arrangements",
    );
    const without = new PipelineMapGenerator(
      passes.filter((p) => p.id !== "slopes"),
      registries,
    );
    const seed = hashSeed("slopes-det");
    const a = without.run(
      params("rural", "temperate"),
      new Mulberry32Rng(seed),
    ).draft;
    const b = new PipelineMapGenerator(passes, registries).run(
      params("rural", "temperate"),
      new Mulberry32Rng(seed),
    ).draft;
    // Slopes add connectors and pieces; they move no ground and no prop.
    for (let z = 0; z < a.depth; z++) {
      for (let x = 0; x < a.width; x++) {
        expect(b.groundLevelAt(x, z)).toBe(a.groundLevelAt(x, z));
      }
    }
    expect(b.props).toEqual(a.props);
  });

  it("wedges the bare blocks beside a plot QA catalogued as J2 (#847, #813)", () => {
    // QA's seed at the ADR 0009 scale, with the coordinates QA re-measured
    // after #838: lot-ring tiles at their natural level, graded yard tiles
    // inside the lot, graded tiles away from any lot, and border tiles,
    // each the lower tile of a one-layer step and bare before the fix.
    // Each now carries a wedge or a wall — the acceptance on #847.
    const map = generateTacticalMap(
      {
        seed: "qa813-temperate-rural-small-0",
        params: { ...params("rural", "temperate"), size: "small" },
      },
      { registries },
    );
    const index = new TileIndex(map);
    // QA's re-measured coordinates on #847, by its buckets: F the lot
    // margin, G inland and unwalled (one population, the lot ring, once
    // read from the draft), E the map border.
    const F = [
      [17, 1, 16],
      [19, 2, 16],
      [19, 0, 18],
      [19, 0, 19],
      [6, 0, 23],
      [5, 0, 24],
    ];
    const G = [
      [20, 2, 17],
      [20, 1, 18],
      [20, 0, 20],
      [4, 0, 23],
      [4, 0, 24],
      [4, 0, 25],
    ];
    const E = [
      [0, 2, 8],
      [0, 2, 9],
      [0, 2, 10],
      [0, 1, 14],
    ];
    // E is not a step at all: every in-bounds neighbour of those tiles is
    // level or lower, and the sheer face QA saw is the map's own edge.
    for (const [x, y, z] of E) {
      const at = { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
      const tile = index.get(at.x, at.y, at.z);
      expect(
        tile,
        `${String(at.x)},${String(at.y)},${String(at.z)}`,
      ).toBeDefined();
      const higher = DIRECTIONS.filter((d) => {
        const n = stepGridPos(at, d);
        return index.get(n.x, at.y + 1, n.z) !== undefined;
      });
      expect(
        higher,
        `${String(at.x)},${String(at.y)},${String(at.z)} faces no one-layer step`,
      ).toEqual([]);
    }
    for (const [x, y, z] of [...F, ...G]) {
      const at = { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
      const tile = index.get(at.x, at.y, at.z);
      expect(
        tile,
        `${String(at.x)},${String(at.y)},${String(at.z)}`,
      ).toBeDefined();
      expect(
        tile?.slope !== undefined || Object.keys(tile?.walls ?? {}).length > 0,
        `${String(at.x)},${String(at.y)},${String(at.z)} carries a wedge or a wall`,
      ).toBe(true);
    }
  });
});
