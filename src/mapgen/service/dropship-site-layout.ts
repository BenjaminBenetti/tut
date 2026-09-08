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
