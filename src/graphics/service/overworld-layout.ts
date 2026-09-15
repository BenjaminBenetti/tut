import type { Vec3 } from "../../core/model/grid";
import type { MapLayout } from "../../overworld/model/map-layout";
import type { OverworldSceneConfig } from "../model/overworld-scene-config";

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

/** Centre of the map plane; the default camera target. */
export function mapCentre(config: OverworldSceneConfig): Vec3 {
  return { x: config.mapWidth / 2, y: 0, z: config.mapDepth / 2 };
}
