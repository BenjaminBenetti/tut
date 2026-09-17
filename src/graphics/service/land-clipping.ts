import { ShapeUtils, Vector2 } from "three";

import type { GroundPoint, GroundPolygon } from "./coastline-projection";
import type { GroundSegment } from "./coastline-segments";
import { isOnLand } from "./land-query";
import { signedArea } from "./region-territory-service";

// ===========================================
// Types
// ===========================================

/** One triangle of land on the ground plane. */
export type GroundTriangle = readonly [GroundPoint, GroundPoint, GroundPoint];

/** Axis-aligned extent on the ground plane. */
interface GroundBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

// ===========================================
// Constants
// ===========================================

/** Pieces shorter than this along a segment are float dust, not land. */
const MIN_SEGMENT_FRACTION = 1e-6;

// ===========================================
// Triangulation
// ===========================================

/**
 * Cuts land masses into triangles, inland seas left out, so any other
 * shape can be clipped against land triangle by triangle. Done once per
 * build; the region territories (#1149) are cut from these.
 *
 * @param polygons - Land masses on the ground plane, rings closed.
 * @returns Every triangle of every land mass, wound consistently.
 */
export function triangulateLand(
  polygons: readonly GroundPolygon[],
): GroundTriangle[] {
  const triangles: GroundTriangle[] = [];
  for (const polygon of polygons) {
    const contour = polygon.outer.map(toVector);
    const holes = polygon.holes.map((hole) => hole.map(toVector));
    // `triangulateShape` indexes into the contour followed by every
    // hole in order, and drops each ring's repeated closing point first.
    const vertices = [
      openRing(polygon.outer),
      ...polygon.holes.map(openRing),
    ].flat();
    for (const [i, j, k] of ShapeUtils.triangulateShape(contour, holes)) {
      const a = vertices[i ?? -1];
      const b = vertices[j ?? -1];
      const c = vertices[k ?? -1];
      if (a && b && c) {
        triangles.push(signedArea([a, b, c]) < 0 ? [c, b, a] : [a, b, c]);
      }
    }
  }
  return triangles;
}

// ===========================================
// Polygon clipping
// ===========================================

/**
 * Sutherland–Hodgman: the part of `subject` inside a convex polygon.
 * Either polygon may be wound either way; the convex one's orientation
 * is read off its area. A triangle in, a convex polygon out, so the
 * result fans into triangles without overlap.
 *
 * ```
 *   subject ──clip edge 1──▶ ──clip edge 2──▶ … ──▶ subject ∩ convex
 * ```
 *
 * @param subject - Any simple polygon, not closed.
 * @param convex - A convex polygon, not closed.
 * @returns The intersection, not closed; empty when they do not meet.
 */
export function clipPolygonToConvex(
  subject: readonly GroundPoint[],
  convex: readonly GroundPoint[],
): GroundPoint[] {
  const orientation = Math.sign(signedArea(convex));
  let output: GroundPoint[] = [...subject];
  for (let i = 0; i < convex.length && output.length > 0; i++) {
    const a = convex[i];
    const b = convex[(i + 1) % convex.length];
    if (!a || !b) {
      continue;
    }
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const next = input[(j + 1) % input.length];
      if (!current || !next) {
        continue;
      }
      const currentInside = side(a, b, current) * orientation >= 0;
      const nextInside = side(a, b, next) * orientation >= 0;
      if (currentInside) {
        output.push(current);
      }
      if (currentInside !== nextInside) {
        output.push(crossing(current, next, a, b));
      }
    }
  }
  return output;
}

/**
 * The pieces of land inside a convex polygon: every land triangle
 * clipped to it, as convex polygons that together tile the overlap
 * exactly, without gaps or doubled area. Triangles whose extent misses
 * the polygon's are skipped without clipping.
 *
 * @param triangles - Land from `triangulateLand`.
 * @param convex - A convex polygon, not closed.
 * @returns The non-degenerate pieces, each wound the same way.
 */
export function clipLandToConvex(
  triangles: readonly GroundTriangle[],
  convex: readonly GroundPoint[],
): GroundPoint[][] {
  const bounds = boundsOf(convex);
  const pieces: GroundPoint[][] = [];
  for (const triangle of triangles) {
    if (!overlaps(bounds, boundsOf(triangle))) {
      continue;
    }
    const piece = clipPolygonToConvex(triangle, convex);
    if (piece.length >= 3 && Math.abs(signedArea(piece)) > 0) {
      pieces.push(wound(piece));
    }
  }
  return pieces;
}

// ===========================================
// Segment clipping
// ===========================================

/**
 * The parts of a segment that lie on land: the segment is cut where it
 * crosses any coastline, and each piece is kept when its midpoint is on
 * land. A segment entirely at sea yields nothing; one entirely on land
 * comes back whole.
 *
 * @param segment - A segment on the ground plane.
 * @param polygons - Land masses, rings closed.
 * @returns The on-land pieces, in order along the segment.
 */
export function clipSegmentToLand(
  segment: GroundSegment,
  polygons: readonly GroundPolygon[],
): GroundSegment[] {
  const cuts = [0, 1];
  for (const polygon of polygons) {
    for (const ring of [polygon.outer, ...polygon.holes]) {
      for (let i = 1; i < ring.length; i++) {
        const c = ring[i - 1];
        const d = ring[i];
        if (!c || !d) {
          continue;
        }
        const t = crossingParameter(segment.a, segment.b, c, d);
        if (t !== undefined) {
          cuts.push(t);
        }
      }
    }
  }
  cuts.sort((p, q) => p - q);
  const pieces: GroundSegment[] = [];
  for (let i = 1; i < cuts.length; i++) {
    const t0 = cuts[i - 1] ?? 0;
    const t1 = cuts[i] ?? 1;
    if (t1 - t0 < MIN_SEGMENT_FRACTION) {
      continue;
    }
    const midpoint = along(segment, (t0 + t1) / 2);
    if (isOnLand(midpoint, polygons)) {
      pieces.push({ a: along(segment, t0), b: along(segment, t1) });
    }
  }
  return pieces;
}

// ===========================================
// Helpers
// ===========================================

/** A ground point as the plane vector `ShapeUtils` takes. */
function toVector(point: GroundPoint): Vector2 {
  return new Vector2(point.x, point.z);
}

/** A closed ring without its repeated closing point, as `ShapeUtils` indexes it. */
function openRing(ring: readonly GroundPoint[]): GroundPoint[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    ring.length > 1 && first?.x === last?.x && first?.z === last?.z;
  return closed ? ring.slice(0, -1) : [...ring];
}

/** The polygon wound with positive area, reversing it when needed. */
function wound(polygon: readonly GroundPoint[]): GroundPoint[] {
  return signedArea(polygon) < 0 ? [...polygon].reverse() : [...polygon];
}

/** Which side of the directed line `a→b` a point is on; zero when on it. */
function side(a: GroundPoint, b: GroundPoint, p: GroundPoint): number {
  return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
}

/** Where the segment `p`–`q` meets the infinite line through `a`–`b`. */
function crossing(
  p: GroundPoint,
  q: GroundPoint,
  a: GroundPoint,
  b: GroundPoint,
): GroundPoint {
  const sp = side(a, b, p);
  const sq = side(a, b, q);
  const t = sp / (sp - sq);
  return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t };
}

/**
 * The parameter along `a`–`b` where it crosses the segment `c`–`d`, or
 * undefined when they are parallel or do not cross within both.
 */
function crossingParameter(
  a: GroundPoint,
  b: GroundPoint,
  c: GroundPoint,
  d: GroundPoint,
): number | undefined {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const denominator = rx * sz - rz * sx;
  if (denominator === 0) {
    return undefined;
  }
  const qx = c.x - a.x;
  const qz = c.z - a.z;
  const t = (qx * sz - qz * sx) / denominator;
  const u = (qx * rz - qz * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : undefined;
}

/** The point a fraction of the way along a segment. */
function along(segment: GroundSegment, t: number): GroundPoint {
  return {
    x: segment.a.x + (segment.b.x - segment.a.x) * t,
    z: segment.a.z + (segment.b.z - segment.a.z) * t,
  };
}

/** Axis-aligned extent of some points. */
function boundsOf(points: readonly GroundPoint[]): GroundBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

/** True when two extents share any area. */
function overlaps(a: GroundBounds, b: GroundBounds): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ
  );
}
