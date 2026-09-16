import type {
  GroundPoint,
  GroundPolygon,
  GroundRing,
} from "./coastline-projection";

// ===========================================
// Rings
// ===========================================

/**
 * Even–odd point-in-polygon: casts a ray along +x from the point and
 * counts the ring edges it crosses. Works on any closed ring, whichever
 * way round it is wound.
 *
 * ```
 *        ┌────────┐
 *   p ●──┼──▶─────┼──▶   two crossings → outside
 *        │   q ●──┼──▶   one crossing  → inside
 *        └────────┘
 * ```
 *
 * @param point - The point to test.
 * @param ring - A closed ring on the ground plane.
 * @returns True when the point is inside the ring.
 */
export function isInsideRing(point: GroundPoint, ring: GroundRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) {
      continue;
    }
    const crosses = a.z > point.z !== b.z > point.z;
    if (
      crosses &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Shortest distance from a point to any edge of a ring, in world units.
 * @param point - The point.
 * @param ring - A closed ring on the ground plane.
 * @returns The distance; `Infinity` for a ring with no edges.
 */
export function distanceToRing(point: GroundPoint, ring: GroundRing): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    if (!a || !b) {
      continue;
    }
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

// ===========================================
// Land
// ===========================================

/**
 * True when the point lies on a land mass: inside its coastline and not
 * inside any inland sea cut out of it.
 * @param point - Point on the ground plane.
 * @param polygons - Land masses on the ground plane.
 * @returns Whether the point is on land.
 */
export function isOnLand(
  point: GroundPoint,
  polygons: readonly GroundPolygon[],
): boolean {
  return polygons.some(
    (polygon) =>
      isInsideRing(point, polygon.outer) &&
      !polygon.holes.some((hole) => isInsideRing(point, hole)),
  );
}

/**
 * How far a point is from the nearest drawn land, in world units: zero
 * on land, otherwise the distance to the closest coastline (a point in
 * an inland sea measures to that sea's shore).
 * @param point - Point on the ground plane.
 * @param polygons - Land masses on the ground plane.
 * @returns The distance to land.
 */
export function distanceToLand(
  point: GroundPoint,
  polygons: readonly GroundPolygon[],
): number {
  if (isOnLand(point, polygons)) {
    return 0;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    best = Math.min(best, distanceToRing(point, polygon.outer));
    for (const hole of polygon.holes) {
      best = Math.min(best, distanceToRing(point, hole));
    }
  }
  return best;
}

// ===========================================
// Helpers
// ===========================================

/** Distance from `p` to the segment `a`–`b`. */
function distanceToSegment(
  p: GroundPoint,
  a: GroundPoint,
  b: GroundPoint,
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  let t = 0;
  if (lengthSq > 0) {
    t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
