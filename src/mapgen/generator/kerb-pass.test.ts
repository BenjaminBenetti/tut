import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { DEFAULT_MISSION_HOOKS } from "../data/hook-requirements";
import { SurfaceIds } from "../data/surfaces";
import type {
  DraftCapability,
  GenerationContext,
  GenerationPass,
} from "../model/generation-pass";
import { createDefaultRegistries } from "../service/default-registries";
import { generateTacticalMap } from "../service/generate-tactical-map";
import { PipelineMapGenerator } from "../service/pipeline-map-generator";
import { TileIndex } from "../service/tile-index";
import { KerbPass } from "./kerb-pass";

const registries = createDefaultRegistries();

/**
 * A pass that lays a street at level 0 with, from west to east: ground
 * one layer up (a kerb, left alone), ground two layers up (walled), ground
 * two layers up joined by a ramp (left to the ramp), and a pavement two
 * layers up (walled). The last row is unpaved on both sides (ignored).
 */
function fixturePass(): GenerationPass {
  const provides: DraftCapability[] = [
    "heightmap",
    "water",
    "roads",
    "lots",
    "elevation",
    "buildings",
    "interiors",
    "props",
    "slopes",
    "ramps",
  ];
  return {
    id: "fixture",
    requires: [],
    provides,
    run: (ctx: GenerationContext): void => {
      const { draft } = ctx;
      for (let x = 0; x < 6; x++) {
        draft.setGroundSurface(x, 1, SurfaceIds.ROAD);
        draft.setRoad(x, 1);
        draft.setGroundLevel(x, 1, 0);
      }
      draft.setGroundLevel(1, 0, 1);
      draft.setGroundLevel(2, 0, 2);
      draft.setGroundLevel(3, 0, 2);
      draft.addConnector("ramp", { x: 3, y: 0, z: 1 }, { x: 3, y: 2, z: 0 });
      draft.setGroundLevel(4, 0, 2);
      draft.setGroundSurface(4, 0, SurfaceIds.SIDEWALK);
      draft.setGroundLevel(1, 2, 2);
      draft.setGroundLevel(1, 3, 0);
      // A pavement two layers below a wedge: the wall goes at the foot.
      draft.setGroundSurface(5, 2, SurfaceIds.SIDEWALK);
      draft.setGroundLevel(5, 2, 0);
      draft.setGroundLevel(5, 3, 2);
      draft.setSlope(5, 3, { kind: "straight", turns: 0 });
    },
  };
}

describe("KerbPass", () => {
  it("walls paved edges of two or more layers, and only those", () => {
    const generator = new PipelineMapGenerator(
      [fixturePass(), new KerbPass()],
      registries,
    );
    const { draft } = generator.run(
      {
        archetype: "settlement",
        biome: "temperate",
        settlement: "town",
        size: { width: 16, depth: 16 },
        hooks: [],
      },
      new Mulberry32Rng(1),
    );
    // The wall stands on the high tile's edge facing the road; the draft
    // mirrors only at the same layer, so the road tile itself shows none.
    const edge = (x: number): string | undefined =>
      draft.wallAt(draft.groundCoord(x, 0), "s");
    // A one-layer step is a kerb and stays bare (exhibit K1).
    expect(edge(1)).toBeUndefined();
    // Two layers up: a half wall on the high side.
    expect(edge(2)).toBe("half");
    // A ramped edge keeps its ramp.
    expect(edge(3)).toBeUndefined();
    // A pavement two layers up is a paved edge too.
    expect(edge(4)).toBe("half");
    // Two layers between two unpaved tiles is not this pass's business.
    expect(draft.wallAt(draft.groundCoord(1, 2), "s")).toBeUndefined();
    // A high tile that is a wedge keeps it clean; the wall is at the foot.
    expect(draft.wallAt(draft.groundCoord(5, 3), "n")).toBeUndefined();
    expect(draft.wallAt(draft.groundCoord(5, 2), "s")).toBe("half");
  });

  it("resolves QA's exhibit K2 and leaves K1 alone on its seed (#863, #813)", () => {
    const map = generateTacticalMap(
      {
        seed: "qa813-temperate-town-small-0",
        params: {
          archetype: "settlement",
          biome: "temperate",
          settlement: "town",
          size: "small",
          hooks: DEFAULT_MISSION_HOOKS,
        },
      },
      { registries },
    );
    const index = new TileIndex(map);
    // K2: the carriageway seam ramps, one per lane, and the pavements
    // flanking it are walled where they drop two layers.
    for (const z of [11, 12, 13]) {
      const ramp = map.connectors.find(
        (c) =>
          c.kind === "ramp" &&
          c.from.x === 32 &&
          c.from.z === z &&
          c.to.x === 31 &&
          c.to.z === z,
      );
      expect(ramp, `ramp at 32,${String(z)}`).toBeDefined();
    }
    expect(index.get(31, 4, 10)?.walls.e, "kerb wall above 32,2,10").toBe(
      "half",
    );
    expect(index.get(31, 4, 14)?.walls.e, "kerb wall above 32,2,14").toBe(
      "half",
    );
    // K1: a one-layer paved step reads as a kerb and is untouched.
    for (const [x, y, z] of [
      [33, 2, 10],
      [12, 2, 32],
    ] as const) {
      const tile = index.get(x, y, z);
      expect(tile, `${String(x)},${String(y)},${String(z)}`).toBeDefined();
      expect(tile?.slope).toBeUndefined();
      expect(Object.keys(tile?.walls ?? {})).toEqual([]);
    }
    // And nothing paved on the map drops two or more layers bare.
    expect(barePavedEdges(map, index)).toEqual([]);
  });
});

/** Paved edges of two or more layers with neither a wall nor a connector. */
function barePavedEdges(
  map: ReturnType<typeof generateTacticalMap>,
  index: TileIndex,
): string[] {
  const paved = (s: string): boolean =>
    s === SurfaceIds.ROAD || s === SurfaceIds.SIDEWALK;
  const ground = (x: number, z: number) =>
    index.column(x, z).find((t) => t.buildingId === undefined);
  const joined = new Set(
    map.connectors.map(
      (c) =>
        `${String(c.from.x)},${String(c.from.z)}|${String(c.to.x)},${String(c.to.z)}`,
    ),
  );
  const bare: string[] = [];
  for (const tile of map.tiles) {
    if (tile.buildingId !== undefined || !paved(tile.surface)) continue;
    for (const [d, dx, dz] of [
      ["n", 0, -1],
      ["e", 1, 0],
      ["s", 0, 1],
      ["w", -1, 0],
    ] as const) {
      const other = ground(tile.x + dx, tile.z + dz);
      if (other === undefined || Math.abs(other.y - tile.y) < 2) continue;
      const a = `${String(tile.x)},${String(tile.z)}|${String(other.x)},${String(other.z)}`;
      const b = `${String(other.x)},${String(other.z)}|${String(tile.x)},${String(tile.z)}`;
      const opposite = { n: "s", e: "w", s: "n", w: "e" } as const;
      if (
        tile.walls[d] !== undefined ||
        other.walls[opposite[d]] !== undefined ||
        joined.has(a) ||
        joined.has(b)
      )
        continue;
      bare.push(`${String(tile.x)},${String(tile.y)},${String(tile.z)} ${d}`);
    }
  }
  return bare;
}
