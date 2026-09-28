import { describe, expect, it } from "vitest";
import { HookKinds } from "../../mapgen/model/hook";
import { PassMask } from "../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import {
  dropshipBoardingTiles,
  dropshipFootprint,
} from "../../mapgen/service/dropship-site-layout";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import {
  isUnderDrawnDropship,
  resolveDrawnDropships,
} from "./drawn-dropship-resolver";
import { resolveForwardDropships } from "./forward-dropship-resolver";

// ===========================================
// Fixtures
// ===========================================

/** The landing zone's clearance, facing north, in the map's low corner. */
const CLEARANCE = { x: 2, z: 2, w: 7, d: 13 };

/** Tiles of a 4 × 4 square from (x, z) on level 2. */
function square(x: number, z: number): TileCoord[] {
  const tiles: TileCoord[] = [];
  for (let dz = 0; dz < 4; dz++) {
    for (let dx = 0; dx < 4; dx++) tiles.push({ x: x + dx, y: 2, z: z + dz });
  }
  return tiles;
}

/**
 * A 40 × 40 floor with a landing zone's ship on its generated site, and
 * a forward point far from it when `forward` is set.
 */
function landingMap(forward: boolean, deployZoneId?: string): TacticalMap {
  const boarding = dropshipBoardingTiles(CLEARANCE, "n", 2);
  const builder = new FixtureMapBuilder(40, 40, 6)
    .fillGround(2)
    .deploy(boarding);
  if (forward) {
    builder.objective(
      HookKinds.FORWARD_EXTRACTION,
      square(26, 26),
      PassMask.ALL,
    );
  }
  const map = builder.build();
  return {
    ...map,
    dropships: [
      {
        deployZoneId: deployZoneId ?? map.hooks.deployZones[0]!.id,
        footprint: dropshipFootprint(CLEARANCE, "n"),
        clearance: CLEARANCE,
        facing: "n",
        level: 2,
      },
    ],
  };
}

// ===========================================
// Tests
// ===========================================

describe("resolveDrawnDropships", () => {
  it("draws the landing zone's ship on its generated site, on the ground", () => {
    const map = landingMap(false);
    expect(resolveDrawnDropships(map)).toEqual([
      {
        footprint: dropshipFootprint(CLEARANCE, "n"),
        level: 2,
        lift: 0,
        facing: "n",
        tile: map.hooks.deployZones[0]!.tiles[0],
      },
    ]);
  });

  it("skips a landing site whose boarding zone is missing rather than guess", () => {
    expect(resolveDrawnDropships(landingMap(false, "missing"))).toEqual([]);
  });

  it("draws the landing zone's ship first, then each forward point's (#1179)", () => {
    const map = landingMap(true);
    const ships = resolveDrawnDropships(map);
    expect(ships).toHaveLength(2);
    expect(ships[0]!.footprint).toEqual(dropshipFootprint(CLEARANCE, "n"));
    expect(ships.slice(1)).toEqual(resolveForwardDropships(map));
  });

  it("works a map's ships out once, so every reader sees the same hulls", () => {
    const map = landingMap(true);
    expect(resolveDrawnDropships(map)).toBe(resolveDrawnDropships(map));
    // A copy of the map is another map, worked out afresh.
    expect(resolveDrawnDropships({ ...map })).not.toBe(
      resolveDrawnDropships(map),
    );
    expect(resolveDrawnDropships({ ...map })).toEqual(
      resolveDrawnDropships(map),
    );
  });
});

describe("isUnderDrawnDropship", () => {
  it("is every column under a drawn hull, landing or forward, at any height (#1179)", () => {
    const map = landingMap(true);
    const [landing, forward] = resolveDrawnDropships(map);
    for (const ship of [landing!, forward!]) {
      const { x, z, w, d } = ship.footprint;
      for (let dz = 0; dz < d; dz++) {
        for (let dx = 0; dx < w; dx++) {
          expect(isUnderDrawnDropship(map, { x: x + dx, z: z + dz })).toBe(
            true,
          );
        }
      }
      // The columns just past each side are not the ship.
      expect(isUnderDrawnDropship(map, { x: x - 1, z })).toBe(false);
      expect(isUnderDrawnDropship(map, { x: x + w, z })).toBe(false);
      expect(isUnderDrawnDropship(map, { x, z: z - 1 })).toBe(false);
      expect(isUnderDrawnDropship(map, { x, z: z + d })).toBe(false);
    }
  });

  it("is no column on a map that draws no ship", () => {
    const map = landingMap(false, "missing");
    for (let z = 0; z < map.depth; z++) {
      for (let x = 0; x < map.width; x++) {
        expect(isUnderDrawnDropship(map, { x, z })).toBe(false);
      }
    }
  });
});
