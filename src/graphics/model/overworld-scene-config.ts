// ===========================================
// Overworld scene tuning
// ===========================================

/**
 * Sizes for the strategic map scene, in world units (1 u = 1 tactical
 * tile, so the default camera zoom applies unchanged). Normalised
 * `MapLayout` coordinates are scaled onto a `mapWidth × mapDepth` plane.
 *
 * ```
 *   y ▲          markers float at markerLift
 *     │   ┌─┐
 *     │   └─┘
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
  /** Radius of a city marker. */
  readonly markerRadius: number;
  /** Height of a disc marker (the fallback when no glyph is available). */
  readonly markerHeight: number;
  /** Side of the square glyph sprite standing on a city, in world units. */
  readonly markerGlyphSize: number;
}

/** Default sizes: a 2:1 plane that fits a 1280 px viewport at minimum zoom. */
export const OVERWORLD_SCENE_CONFIG: OverworldSceneConfig = {
  mapWidth: 24,
  mapDepth: 12,
  markerLift: 0.05,
  oceanHeight: 0.1,
  markerRadius: 0.3,
  markerHeight: 0.25,
  markerGlyphSize: 0.6,
};
