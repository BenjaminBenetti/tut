import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import { DROPSHIP_SITE_RULES } from "../data/dropship-site";
import type { TileCoord } from "../model/tile-coord";

/** Maps local coordinates (u across, v inward from the nose edge) onto the site. */
export function dropshipSiteColumn(
  clearance: Rect,
  facing: Direction,
  u: number,
  v: number,
): { x: number; z: number } {
  switch (facing) {
    case "n":
      return { x: clearance.x + u, z: clearance.z + v };
    case "s":
      return { x: clearance.x + u, z: clearance.z + clearance.d - 1 - v };
    case "w":
      return { x: clearance.x + v, z: clearance.z + u };
    case "e":
      return { x: clearance.x + clearance.w - 1 - v, z: clearance.z + u };
  }
}

/** Axis-aligned hull bounds inside its cardinally oriented clearance. */
export function dropshipFootprint(clearance: Rect, facing: Direction): Rect {
  const { margin, width, length } = DROPSHIP_SITE_RULES;
  const a = dropshipSiteColumn(clearance, facing, margin, margin);
  const b = dropshipSiteColumn(
    clearance,
    facing,
    margin + width - 1,
    margin + length - 1,
  );
  return {
    x: Math.min(a.x, b.x),
    z: Math.min(a.z, b.z),
    w: Math.abs(a.x - b.x) + 1,
    d: Math.abs(a.z - b.z) + 1,
  };
}

/** The extra inward access row may meet an existing street; the aircraft and starts may not. */
export function dropshipApproachRect(clearance: Rect, facing: Direction): Rect {
  if (facing === "n")
    return {
      x: clearance.x,
      z: clearance.z + clearance.d - 1,
      w: clearance.w,
      d: 1,
    };
  if (facing === "s")
    return { x: clearance.x, z: clearance.z, w: clearance.w, d: 1 };
  if (facing === "w")
    return {
      x: clearance.x + clearance.w - 1,
      z: clearance.z,
      w: 1,
      d: clearance.d,
    };
  return { x: clearance.x, z: clearance.z, w: 1, d: clearance.d };
}

/**
 * The clearance whose boarding patch is the square with its low corner
 * at `patch`: the inverse of `dropshipBoardingTiles`, for drawing an
 * aircraft beside a boarding square the generator placed on its own (a
 * Great Hive's forward extraction point, #1179). Facing north, the hull
 * lies north of the patch with its ramp on the patch's north edge:
 *
 * ```
 *   · · · · · · ·   ← clearance (margin around hull and patch)
 *   · H H H H H ·
 *   · H  hull H ·
 *   · H H H H H ·   ← ramp
 *   · P P P P · ·
 *   · P patch · ·   ← `patch` is the P square's low corner
 *   · P P P P · ·
 *   · · · · · · ·
 * ```
 *
 * @param patch - The boarding square's low corner.
 * @param patch.x - Its lowest column.
 * @param patch.z - Its lowest row.
 * @param facing - The way the nose points.
 */
export function dropshipClearanceFor(
  patch: { x: number; z: number },
  facing: Direction,
): Rect {
  const { margin, width, length, boardingSide } = DROPSHIP_SITE_RULES;
  const vertical = facing === "n" || facing === "s";
  const across = width + 2 * margin;
  const inward = 2 * margin + length + boardingSide;
  const size = { w: vertical ? across : inward, d: vertical ? inward : across };
  const tiles = dropshipBoardingTiles({ x: 0, z: 0, ...size }, facing, 0);
  return {
    x: patch.x - Math.min(...tiles.map((tile) => tile.x)),
    z: patch.z - Math.min(...tiles.map((tile) => tile.z)),
    ...size,
  };
}

/** Grid-aligned boarding patch touching the rear ramp, outside the full hull. */
export function dropshipBoardingTiles(
  clearance: Rect,
  facing: Direction,
  level: number,
): TileCoord[] {
  const { margin, length, boardingSide } = DROPSHIP_SITE_RULES;
  const tiles: TileCoord[] = [];
  for (let v = 0; v < boardingSide; v++)
    for (let u = 0; u < boardingSide; u++)
      tiles.push({
        ...dropshipSiteColumn(
          clearance,
          facing,
          margin + u,
          margin + length + v,
        ),
        y: level,
      });
  return tiles;
}
