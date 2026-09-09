import { BoxGeometry } from "three";
import type { BufferGeometry } from "three";

import { stepGridPos } from "../../core/service/grid-math";
import type { Direction } from "../../core/model/direction";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Tile } from "../../mapgen/model/tile";
import type { TileIndex } from "../../mapgen/service/tile-index";

// ===========================================
// Water boundary
// ===========================================

const SIDES: readonly [Direction, number][] = [
  ["n", 1],
  ["e", 2],
  ["s", 4],
  ["w", 8],
];

/** Whether this tile supplies a flat, natural water column. */
function isFlatWater(tile: Tile | undefined): tile is Tile {
  return (
    tile?.surface === SurfaceIds.WATER &&
    tile.buildingId === undefined &&
    tile.slope === undefined
  );
}

/**
 * Exposed sides of a flat water column, or undefined for other ground.
 * Only another flat water tile at the same level hides a side: land,
 * height changes and the map boundary retain the original outer shell.
 */
export function waterBoundaryMask(
  tile: Tile,
  index: TileIndex,
): number | undefined {
  if (!isFlatWater(tile)) return undefined;
  let mask = 0;
  for (const [direction, bit] of SIDES) {
    if (!isFlatWater(index.getAt(stepGridPos(tile, direction)))) mask |= bit;
  }
  return mask;
}

/**
 * Original unit-box top/bottom and exposed sides, retaining exact vertices,
 * normals and UVs. Removing coincident internal faces prevents #1005's grid
 * without changing the visible water height, material or exterior boundary.
 */
export function createWaterBoundaryGeometry(mask: number): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const indices = geometry.index!;
  const normals = geometry.getAttribute("normal");
  const kept: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const vertex = indices.getX(i);
    const x = normals.getX(vertex);
    const z = normals.getZ(vertex);
    const bit = x > 0 ? 2 : x < 0 ? 8 : z > 0 ? 4 : z < 0 ? 1 : 0;
    if (bit === 0 || (mask & bit) !== 0) {
      kept.push(vertex, indices.getX(i + 1), indices.getX(i + 2));
    }
  }
  geometry.setIndex(kept);
  geometry.clearGroups();
  return geometry;
}
