import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import type { GroundPoint } from "./coastline-projection";
import { layoutToWorld } from "./overworld-layout";
import type {
  TerritoryBounds,
  TerritorySeed,
} from "./region-territory-service";
import {
  cellAt,
  computeTerritories,
  regionBorders,
  signedArea,
} from "./region-territory-service";

// ===========================================
// Fixtures
// ===========================================

const BOUNDS: TerritoryBounds = { width: 24, depth: 12 };

/** Two regions of two cities each, west and east, with a lone third region south. */
const SEEDS: readonly TerritorySeed[] = [
  { cityId: "a", regionId: "west", point: { x: 4, z: 3 } },
  { cityId: "b", regionId: "west", point: { x: 8, z: 4 } },
  { cityId: "c", regionId: "east", point: { x: 16, z: 3 } },
  { cityId: "d", regionId: "east", point: { x: 20, z: 5 } },
  { cityId: "e", regionId: "south", point: { x: 12, z: 10 } },
];

/** The shipped cities as seeds in world units. */
function shippedSeeds(): TerritorySeed[] {
  return EARTH_MAP.cities.map((city) => {
    const world = layoutToWorld(city.layout, OVERWORLD_SCENE_CONFIG);
    return {
      cityId: city.id,
      regionId: city.regionId,
      point: { x: world.x, z: world.z },
    };
  });
}

/** True when the polygon turns the same way at every corner. */
function isConvex(vertices: readonly GroundPoint[]): boolean {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const c = vertices[(i + 2) % vertices.length];
    if (!a || !b || !c) return false;
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) continue;
    const turn = Math.sign(cross);
    if (sign === 0) sign = turn;
    else if (turn !== sign) return false;
  }
  return true;
}

/** Even–odd containment for a convex polygon's own seed. */
function contains(vertices: readonly GroundPoint[], p: GroundPoint): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (!a || !b) continue;
    const crosses = a.z > p.z !== b.z > p.z;
    if (crosses && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// ===========================================
// Tests
// ===========================================

describe("computeTerritories (#1149)", () => {
  it("gives every seed a convex cell that contains it", () => {
    const cells = computeTerritories(SEEDS, BOUNDS);
    expect(cells).toHaveLength(SEEDS.length);
    for (const cell of cells) {
      expect(cell.vertices.length).toBeGreaterThanOrEqual(3);
      expect(isConvex(cell.vertices)).toBe(true);
      expect(contains(cell.vertices, cell.seed)).toBe(true);
    }
  });

  it("tiles the rectangle: the cells' areas sum to the map's", () => {
    const cells = computeTerritories(SEEDS, BOUNDS);
    const total = cells.reduce(
      (sum, cell) => sum + Math.abs(signedArea(cell.vertices)),
      0,
    );
    expect(total).toBeCloseTo(BOUNDS.width * BOUNDS.depth, 6);
  });

  it("puts every point nearer its own seed than any other", () => {
    const cells = computeTerritories(SEEDS, BOUNDS);
    for (const cell of cells) {
      for (const vertex of cell.vertices) {
        const own = Math.hypot(vertex.x - cell.seed.x, vertex.z - cell.seed.z);
        for (const other of SEEDS) {
          const theirs = Math.hypot(
            vertex.x - other.point.x,
            vertex.z - other.point.z,
          );
          expect(theirs).toBeGreaterThanOrEqual(own - 1e-9);
        }
      }
    }
  });

  it("tags each edge with the neighbour across it, and map edges with none", () => {
    const cells = computeTerritories(SEEDS, BOUNDS);
    const byId = new Map(cells.map((cell) => [cell.cityId, cell]));
    const a = byId.get("a");
    if (!a) throw new Error("no cell a");
    const neighbours = a.edges.map((edge) => edge.neighbourCityId);
    // West and north map edges, and the bisector with b.
    expect(neighbours).toContain(undefined);
    expect(neighbours).toContain("b");
    // A tagged edge lies on the bisector: its ends are equidistant.
    for (const edge of a.edges) {
      if (edge.neighbourCityId === undefined) continue;
      const other = byId.get(edge.neighbourCityId);
      if (!other) throw new Error("dangling neighbour");
      for (const end of [edge.a, edge.b]) {
        expect(Math.hypot(end.x - a.seed.x, end.z - a.seed.z)).toBeCloseTo(
          Math.hypot(end.x - other.seed.x, end.z - other.seed.z),
          9,
        );
      }
    }
  });
});

describe("regionBorders (#1149)", () => {
  it("leaves out edges between two cells of the same region", () => {
    const borders = regionBorders(computeTerritories(SEEDS, BOUNDS));
    for (const border of borders) {
      expect(border.regionIds[0]).not.toBe(border.regionIds[1]);
    }
    // a|b and c|d are interior; the bisectors that remain all involve
    // south or cross the west/east divide.
    const pairs = borders.map((border) =>
      [...border.regionIds].sort().join("|"),
    );
    expect(pairs).toContain("east|west");
    expect(pairs).toContain("south|west");
    expect(pairs).toContain("east|south");
  });

  it("reports each border segment once", () => {
    const borders = regionBorders(computeTerritories(SEEDS, BOUNDS));
    const keys = borders.map((border) => {
      const ends = [border.a, border.b]
        .map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)}`)
        .sort();
      return ends.join(">");
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("borders nothing when every city is in one region", () => {
    const one = SEEDS.map((seed) => ({ ...seed, regionId: "only" }));
    expect(regionBorders(computeTerritories(one, BOUNDS))).toEqual([]);
  });
});

describe("the shipped Earth map's territories (#1149)", () => {
  it("gives every one of the 17 regions at least one cell", () => {
    const cells = computeTerritories(shippedSeeds(), {
      width: OVERWORLD_SCENE_CONFIG.mapWidth,
      depth: OVERWORLD_SCENE_CONFIG.mapDepth,
    });
    const regionsWithCells = new Set(cells.map((cell) => cell.regionId));
    expect(EARTH_MAP.regions).toHaveLength(17);
    for (const region of EARTH_MAP.regions) {
      expect(regionsWithCells.has(region.id)).toBe(true);
    }
  });

  it("places every city inside its own region's territory", () => {
    const seeds = shippedSeeds();
    const cells = computeTerritories(seeds, {
      width: OVERWORLD_SCENE_CONFIG.mapWidth,
      depth: OVERWORLD_SCENE_CONFIG.mapDepth,
    });
    for (const city of EARTH_MAP.cities) {
      const world = layoutToWorld(city.layout, OVERWORLD_SCENE_CONFIG);
      const cell = cellAt({ x: world.x, z: world.z }, cells);
      expect(cell?.cityId).toBe(city.id);
      expect(cell?.regionId).toBe(city.regionId);
      const geometric = cells.find((candidate) =>
        contains(candidate.vertices, { x: world.x, z: world.z }),
      );
      expect(geometric?.regionId).toBe(city.regionId);
    }
  });
});
