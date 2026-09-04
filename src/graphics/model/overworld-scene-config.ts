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
 *     │ ┌─┴─┴───────┐ ◀── translucent region plate, plateHeight thick
 *   0 ┼─┴───────────┴──── slab top: the Earth texture, or flat ocean
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
  /**
   * Peak opacity of a region's infestation wash, reached at full
   * infestation and fading to nothing at the wash's edge (#440). The map
   * always shows through it.
   */
  readonly plateOpacity: number;
  /** Thickness of the ocean slab beneath the plates. */
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
  platePadding: 0.8,
  plateMinSize: 1.6,
  plateHeight: 0.05,
  plateOpacity: 0.45,
  oceanHeight: 0.1,
  markerRadius: 0.3,
  markerHeight: 0.25,
  markerGlyphSize: 0.6,
};
