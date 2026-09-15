import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import type {
  GroundPoint,
  GroundPolygon,
  GroundRing,
} from "./coastline-projection";

// ===========================================
// Types
// ===========================================

/** One drawn coastline edge on the ground plane. */
export interface GroundSegment {
  readonly a: GroundPoint;
  readonly b: GroundPoint;
}

// ===========================================
// Constants
// ===========================================

/** How close to the map's edge a coordinate must be to count as on it. */
const BORDER_EPSILON = 1e-6;

// ===========================================
// Segments
// ===========================================

/**
 * Every coastline edge worth drawing: each ring edge of each land mass,
 * outer coast and inland seas alike, minus the edges that run along the
 * map's own border. Natural Earth closes Antarctica along −90° and the
 * antimeridian, and those edges drawn would be a line across the whole
 * bottom of the map: they are the edge of the plane, not a coast.
 *
 * @param polygons - Land masses on the ground plane.
 * @param config - Map plane size, to recognise its border.
 * @returns The segments, in ring order.
 */
export function coastlineSegments(
  polygons: readonly GroundPolygon[],
  config: OverworldSceneConfig,
): GroundSegment[] {
  const segments: GroundSegment[] = [];
  for (const polygon of polygons) {
    pushRing(segments, polygon.outer, config);
    for (const hole of polygon.holes) {
      pushRing(segments, hole, config);
    }
  }
  return segments;
}

/**
 * True when both ends of a segment lie on the same edge of the map
 * plane: the antimeridian on either side, the poles top and bottom.
 *
 * @param a - One end.
 * @param b - The other end.
 * @param config - Map plane size.
 * @returns Whether the segment is part of the map's border.
 */
export function isBorderSegment(
  a: GroundPoint,
  b: GroundPoint,
  config: OverworldSceneConfig,
): boolean {
  const onEdge = (value: number, edge: number): boolean =>
    Math.abs(value - edge) <= BORDER_EPSILON;
  return (
    (onEdge(a.x, 0) && onEdge(b.x, 0)) ||
    (onEdge(a.x, config.mapWidth) && onEdge(b.x, config.mapWidth)) ||
    (onEdge(a.z, 0) && onEdge(b.z, 0)) ||
    (onEdge(a.z, config.mapDepth) && onEdge(b.z, config.mapDepth))
  );
}

// ===========================================
// Helpers
// ===========================================

/** Appends every edge of a ring that is not part of the map's border. */
function pushRing(
  segments: GroundSegment[],
  ring: GroundRing,
  config: OverworldSceneConfig,
): void {
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    if (a && b && !isBorderSegment(a, b, config)) {
      segments.push({ a, b });
    }
  }
}
