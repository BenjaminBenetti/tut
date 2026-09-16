// ===========================================
// Overworld scene tuning
// ===========================================

/**
 * Sizes for the strategic map scene, in world units (1 u = 1 tactical
 * tile, so the default camera zoom applies unchanged). Normalised
 * `MapLayout` coordinates are scaled onto a `mapWidth × mapDepth` plane.
 *
 * ```
 *   y ▲          settlements stand at markerLift
 *     │   ▄▟█▙▄
 *     │  ▔▔▔▔▔▔▔  halo ring: just outside the settlementFootprint
 *     │ ─────────────── ◀── wireframe Earth and region territories (#1144, #1149)
 *   0 ┼──────────────── slab top: the ui-bg ground
 *     └──────────────────────────────▶ x / z
 * ```
 */
export interface OverworldSceneConfig {
  /** World-unit width of the map plane; layout `x ∈ [0, 1]` spans it west → east. */
  readonly mapWidth: number;
  /** World-unit depth of the map plane; layout `y ∈ [0, 1]` spans it north → south. */
  readonly mapDepth: number;
  /**
   * Height above the slab top that city markers stand at: above every
   * line the wireframe Earth and the region territories draw, so a
   * marker is never cut by them.
   */
  readonly markerLift: number;
  /** Thickness of the ocean slab beneath the map. */
  readonly oceanHeight: number;
  /**
   * Side of the square footprint every settlement model is authored
   * on (#1152); the pad, ring and pick solid are sized from it.
   */
  readonly settlementFootprint: number;
  /** Height of the invisible solid the pointer raycasts against, over a settlement. */
  readonly markerPickHeight: number;
  /** Side of the square footprint every installation model is authored on (#1153). */
  readonly installationFootprint: number;
  /**
   * Radius of the ring installations are laid out on around their
   * region's anchor (#1155): clear of a settlement standing on the
   * anchor, and of each other.
   */
  readonly installationRingRadius: number;
  /** Least distance an installation keeps from any city or other installation. */
  readonly installationClearance: number;
}

/** Default sizes: a 2:1 plane that fits a 1280 px viewport at minimum zoom. */
export const OVERWORLD_SCENE_CONFIG: OverworldSceneConfig = {
  mapWidth: 24,
  mapDepth: 12,
  markerLift: 0.05,
  oceanHeight: 0.1,
  settlementFootprint: 0.6,
  markerPickHeight: 0.4,
  installationFootprint: 0.45,
  installationRingRadius: 0.7,
  installationClearance: 0.55,
};
