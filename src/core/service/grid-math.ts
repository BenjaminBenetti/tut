import type { Direction } from "../model/direction";
import type { GridPos, Rect } from "../model/grid";

// ===========================================
// Directions
// ===========================================

const DIRECTION_OFFSETS: Readonly<Record<Direction, GridPos>> = {
  n: { x: 0, y: 0, z: -1 },
  e: { x: 1, y: 0, z: 0 },
  s: { x: 0, y: 0, z: 1 },
  w: { x: -1, y: 0, z: 0 },
};

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  n: "s",
  e: "w",
  s: "n",
  w: "e",
};

/** Returns the unit offset for a direction on the same level. */
export function directionOffset(direction: Direction): GridPos {
  return DIRECTION_OFFSETS[direction];
}

/** Returns the direction pointing the other way. */
export function oppositeDirection(direction: Direction): Direction {
  return OPPOSITE[direction];
}

// ===========================================
// Positions
// ===========================================

/** Component-wise sum of two positions. */
export function addGridPos(a: GridPos, b: GridPos): GridPos {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Returns the neighbour one step in the given direction, same level. */
export function stepGridPos(pos: GridPos, direction: Direction): GridPos {
  return addGridPos(pos, DIRECTION_OFFSETS[direction]);
}

/** True when both positions have identical components. */
export function gridPosEquals(a: GridPos, b: GridPos): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** Manhattan (4-connected) distance on the map plane, ignoring level. */
export function manhattanDistance(a: GridPos, b: GridPos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** Chebyshev (8-connected) distance on the map plane, ignoring level. */
export function chebyshevDistance(a: GridPos, b: GridPos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

/**
 * Packs a position into a single integer key for indexing, using the
 * layout `(y * depth + z) * width + x`. Out-of-bounds positions throw so
 * a bad key never silently aliases another tile.
 */
export function gridKey(pos: GridPos, width: number, depth: number): number {
  if (!isInBounds(pos, width, depth)) {
    throw new Error(
      `Position (${pos.x}, ${pos.y}, ${pos.z}) is outside a ${width}×${depth} grid`,
    );
  }
  return (pos.y * depth + pos.z) * width + pos.x;
}

/** True when `x` and `z` fall inside a `width × depth` grid and `y` is non-negative. */
export function isInBounds(
  pos: GridPos,
  width: number,
  depth: number,
): boolean {
  return (
    Number.isInteger(pos.x) &&
    Number.isInteger(pos.y) &&
    Number.isInteger(pos.z) &&
    pos.x >= 0 &&
    pos.x < width &&
    pos.z >= 0 &&
    pos.z < depth &&
    pos.y >= 0
  );
}

// ===========================================
// Rectangles
// ===========================================

/** True when the tile column `(x, z)` lies inside the rectangle. */
export function rectContains(rect: Rect, x: number, z: number): boolean {
  return (
    x >= rect.x && x < rect.x + rect.w && z >= rect.z && z < rect.z + rect.d
  );
}

/** True when the two rectangles share at least one tile. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d
  );
}
