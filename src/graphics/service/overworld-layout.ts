import type { Vec3 } from "../../core/model/grid";
import type { City } from "../../overworld/model/city";
import { CITY_MARKER_NUDGES } from "../data/city-marker-nudges";
import type { MapLayout } from "../../overworld/model/map-layout";
import type { Region } from "../../overworld/model/region";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";

// ===========================================
// Types
// ===========================================

/** Where a region plate sits and how big it is, in world units. */
export interface PlateExtent {
  /** Centre of the plate on the ground plane (`y` is 0). */
  readonly centre: Vec3;
  readonly width: number;
  readonly depth: number;
}

// ===========================================
// Positions
// ===========================================

/**
 * Scales a normalised map position onto the ground plane: layout `x`
 * runs along world `+x` (east) and layout `y` along world `+z` (south),
 * so north is at `z = 0`.
 */
export function layoutToWorld(
  layout: MapLayout,
  config: OverworldSceneConfig,
): Vec3 {
  return { x: layout.x * config.mapWidth, y: 0, z: layout.y * config.mapDepth };
}

/**
 * Where a city's marker is drawn, in layout space: its true projected
 * position plus the correction that puts it on the coastline the Earth
 * texture actually draws (#439). Cities the drawing already agrees with
 * are unchanged.
 */
export function cityMarkerLayout(city: City): MapLayout {
  const nudge = CITY_MARKER_NUDGES[city.id];
  return nudge === undefined
    ? city.layout
    : { x: city.layout.x + nudge.x, y: city.layout.y + nudge.y };
}

/** Centre of the map plane; the default camera target. */
export function mapCentre(config: OverworldSceneConfig): Vec3 {
  return { x: config.mapWidth / 2, y: 0, z: config.mapDepth / 2 };
}

// ===========================================
// Plates
// ===========================================

/**
 * Sizes a region's placeholder plate: centred on the region's own label
 * position and wide enough to cover every one of its cities plus
 * padding, never smaller than `plateMinSize` on a side.
 */
export function regionPlateExtent(
  region: Region,
  cities: readonly City[],
  config: OverworldSceneConfig,
): PlateExtent {
  const centre = layoutToWorld(region.layout, config);
  let halfWidth = 0;
  let halfDepth = 0;
  for (const city of cities) {
    const position = layoutToWorld(city.layout, config);
    halfWidth = Math.max(halfWidth, Math.abs(position.x - centre.x));
    halfDepth = Math.max(halfDepth, Math.abs(position.z - centre.z));
  }
  return {
    centre,
    width: Math.max(config.plateMinSize, 2 * (halfWidth + config.platePadding)),
    depth: Math.max(config.plateMinSize, 2 * (halfDepth + config.platePadding)),
  };
}
