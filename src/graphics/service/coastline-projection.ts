import { projectEquirectangular } from "../../overworld/service/map-projection";
import type {
  EarthCoastlines,
  GeoRing,
  LandPolygon,
} from "../model/earth-coastlines";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";
import { layoutToWorld } from "./overworld-layout";

// ===========================================
// Types
// ===========================================

/** A point on the map's ground plane, in world units (`y` is implied 0). */
export interface GroundPoint {
  readonly x: number;
  readonly z: number;
}

/** A closed ring on the ground plane; the first point is repeated last. */
export type GroundRing = readonly GroundPoint[];

/** A land mass on the ground plane: outer coastline plus inland seas. */
export interface GroundPolygon {
  readonly outer: GroundRing;
  readonly holes: readonly GroundRing[];
}

// ===========================================
// Projection
// ===========================================

/**
 * Puts one geographic ring on the ground plane through the same two
 * steps a city goes through: `projectEquirectangular` into layout
 * space, then `layoutToWorld` onto the plane. Using the city's own
 * pipeline, rather than a copy of its formula, is what makes the drawn
 * coastline and the markers agree by construction (#1144).
 *
 * ```
 *   [lon, lat] ──projectEquirectangular──▶ {x, y} ∈ [0,1]² ──layoutToWorld──▶ {x, z}
 * ```
 *
 * @param ring - Closed ring in `[longitude, latitude]` degrees.
 * @param config - Map plane size.
 * @returns The ring in world units, still closed, in the same order.
 */
export function projectRing(
  ring: GeoRing,
  config: OverworldSceneConfig,
): GroundRing {
  return ring.map(([longitude, latitude]) => {
    const world = layoutToWorld(
      projectEquirectangular(latitude, longitude),
      config,
    );
    return { x: world.x, z: world.z };
  });
}

/**
 * Projects a land polygon, outer ring and holes alike.
 * @param polygon - Land mass in degrees.
 * @param config - Map plane size.
 * @returns The land mass on the ground plane.
 */
export function projectLandPolygon(
  polygon: LandPolygon,
  config: OverworldSceneConfig,
): GroundPolygon {
  return {
    outer: projectRing(polygon.outer, config),
    holes: polygon.holes.map((hole) => projectRing(hole, config)),
  };
}

/**
 * Projects every land mass of a coastline set.
 * @param coastlines - The vector coastline set.
 * @param config - Map plane size.
 * @returns Every land mass on the ground plane, in the set's order.
 */
export function projectCoastlines(
  coastlines: EarthCoastlines,
  config: OverworldSceneConfig,
): readonly GroundPolygon[] {
  return coastlines.polygons.map((polygon) =>
    projectLandPolygon(polygon, config),
  );
}
