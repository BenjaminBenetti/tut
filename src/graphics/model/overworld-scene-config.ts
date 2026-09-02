// ===========================================
// Overworld scene tuning
// ===========================================

/**
 * Sizes for the strategic map scene, in world units (1 u = 1 tactical
 * tile, so the default camera zoom applies unchanged). Normalised
 * `MapLayout` coordinates are scaled onto a `mapWidth × mapDepth` plane.
 *
 * ```
 *   y ▲          markers stand on the plate top
 *     │   ┌─┐
 *     │ ┌─┴─┴───────┐ ◀── region plate, plateHeight thick
 *   0 ┼─┴───────────┴──── ocean slab top
 *     └──────────────────────────────▶ x / z
 * ```
 */
export interface OverworldSceneConfig {
  /** World-unit width of the map plane; layout `x ∈ [0, 1]` spans it west → east. */
  readonly mapWidth: number;
  /** World-unit depth of the map plane; layout `y ∈ [0, 1]` spans it north → south. */
  readonly mapDepth: number;
  /** Extra plate size beyond a region's outermost cities. */
  readonly platePadding: number;
  /** Smallest plate side, so a one-city region still reads as a plate. */
  readonly plateMinSize: number;
  /** Thickness of a region plate; its top is the surface markers stand on. */
  readonly plateHeight: number;
  /** Thickness of the ocean slab beneath the plates. */
  readonly oceanHeight: number;
  /** Radius of a city marker. */
  readonly markerRadius: number;
  /** Height of a city marker. */
  readonly markerHeight: number;
}

/** Default sizes: a 2:1 plane that fits a 1280 px viewport at minimum zoom. */
export const OVERWORLD_SCENE_CONFIG: OverworldSceneConfig = {
  mapWidth: 24,
  mapDepth: 12,
  platePadding: 0.8,
  plateMinSize: 1.6,
  plateHeight: 0.15,
  oceanHeight: 0.1,
  markerRadius: 0.3,
  markerHeight: 0.25,
};
