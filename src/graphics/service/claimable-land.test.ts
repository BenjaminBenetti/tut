import { describe, expect, it } from "vitest";

import { EARTH_COASTLINES } from "../data/earth-coastlines";
import { OVERWORLD_SCENE_CONFIG } from "../model/overworld-scene-config";
import {
  partitionClaimableLand,
  UNCLAIMED_SOUTH_OF_LATITUDE,
} from "./claimable-land";
import type { GroundPolygon } from "./coastline-projection";
import { projectCoastlines } from "./coastline-projection";

/** A closed axis-aligned rectangle ring as a land mass. */
function block(x0: number, z0: number, x1: number, z1: number): GroundPolygon {
  return {
    outer: [
      { x: x0, z: z0 },
      { x: x1, z: z0 },
      { x: x1, z: z1 },
      { x: x0, z: z1 },
      { x: x0, z: z0 },
    ],
    holes: [],
  };
}

describe("partitionClaimableLand (#1149)", () => {
  it("keeps land north of the cutoff and sets aside land wholly south of it", () => {
    const { mapDepth } = OVERWORLD_SCENE_CONFIG;
    // −60° is 150/180 of the way down the plane.
    const cutoff = ((90 - UNCLAIMED_SOUTH_OF_LATITUDE) / 180) * mapDepth;
    const north = block(1, 1, 3, 3);
    const straddling = block(5, cutoff - 0.5, 7, cutoff + 0.5);
    const polar = block(9, cutoff + 0.1, 11, mapDepth);
    const land = partitionClaimableLand(
      [north, straddling, polar],
      OVERWORLD_SCENE_CONFIG,
    );
    expect(land.claimable).toEqual([north, straddling]);
    expect(land.unclaimed).toEqual([polar]);
  });

  it("sets aside Antarctica from the shipped coastlines and nothing else", () => {
    const land = partitionClaimableLand(
      projectCoastlines(EARTH_COASTLINES, OVERWORLD_SCENE_CONFIG),
      OVERWORLD_SCENE_CONFIG,
    );
    expect(land.unclaimed.length).toBeGreaterThanOrEqual(1);
    // The polar land is the widest polygon on the map: it spans the antimeridian.
    const widest = Math.max(
      ...land.unclaimed.map(
        (polygon) =>
          Math.max(...polygon.outer.map((p) => p.x)) -
          Math.min(...polygon.outer.map((p) => p.x)),
      ),
    );
    expect(widest).toBeCloseTo(OVERWORLD_SCENE_CONFIG.mapWidth, 1);
    // Tierra del Fuego, at 55°S, stays claimable.
    const z55 = ((90 + 55) / 180) * OVERWORLD_SCENE_CONFIG.mapDepth;
    const southernClaimable = land.claimable.filter((polygon) =>
      polygon.outer.some((p) => p.z > z55 - 0.2),
    );
    expect(southernClaimable.length).toBeGreaterThan(0);
    expect(land.claimable.length + land.unclaimed.length).toBe(
      EARTH_COASTLINES.polygons.length,
    );
  });
});
