import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitTemplate } from "../model/unit-template";

// ===========================================
// Size
// ===========================================

/** Tiles per side of a unit that declares no footprint. */
export const DEFAULT_FOOTPRINT = 1;

/**
 * Tiles per side a template's units cover on the ground plane (#1130):
 * its declared `footprint`, or one when it declares none, as every
 * template did before the brute.
 *
 * @param template - The template, or anything carrying its footprint.
 * @returns A positive integer.
 */
export function footprintSizeOf(
  template: Pick<UnitTemplate, "footprint">,
): number {
  return template.footprint ?? DEFAULT_FOOTPRINT;
}

// ===========================================
// Tiles
// ===========================================

/**
 * Every tile a footprint of `size` covers from its anchor `pos`: the
 * anchor first, then row-major — `z` outer, `x` inner — all at the
 * anchor's `y`.
 *
 * ```
 *   size 2 at (x, z)   ──►  [(x, z), (x+1, z), (x, z+1), (x+1, z+1)]
 * ```
 *
 * @param pos - The anchor: the footprint's lowest `x` and lowest `z`.
 * @param size - Tiles per side; `1` is the anchor alone.
 * @returns The covered tiles, anchor first.
 */
export function footprintTiles(pos: TileCoord, size: number): TileCoord[] {
  const tiles: TileCoord[] = [];
  const side = Math.max(1, Math.floor(size));
  for (let dz = 0; dz < side; dz++) {
    for (let dx = 0; dx < side; dx++) {
      tiles.push({ x: pos.x + dx, y: pos.y, z: pos.z + dz });
    }
  }
  return tiles;
}

/**
 * Where a footprint's middle is on the ground plane, in tile units: the
 * anchor's corner plus half the side. A one-tile footprint centres on
 * its own tile at `+0.5`; a 2×2 centres on the corner its four tiles
 * share, at `+1`.
 *
 * @param pos - The anchor.
 * @param size - Tiles per side.
 * @returns The centre in tile units on the ground plane.
 */
export function footprintCentre(
  pos: TileCoord,
  size: number,
): { x: number; z: number } {
  return { x: pos.x + size / 2, z: pos.z + size / 2 };
}

/**
 * True when `tile` is one of the tiles a footprint of `size` anchored at
 * `pos` covers, level included.
 *
 * @param pos - The anchor.
 * @param size - Tiles per side.
 * @param tile - The tile asked about.
 * @returns True when the footprint covers it.
 */
export function footprintContains(
  pos: TileCoord,
  size: number,
  tile: TileCoord,
): boolean {
  return (
    tile.y === pos.y &&
    tile.x >= pos.x &&
    tile.x < pos.x + size &&
    tile.z >= pos.z &&
    tile.z < pos.z + size
  );
}
