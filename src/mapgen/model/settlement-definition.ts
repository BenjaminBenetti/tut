import type { SettlementScale } from "../../content/model/settlement-scale";

// ===========================================
// Settlement definition
// ===========================================

/** Inclusive integer range. */
export interface IntRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Road network shape the road pass builds.
 *
 * ```
 *   trail    one meandering road edge to edge
 *   streets  a main street plus a few side streets
 *   grid     regular blocks with alleys
 * ```
 */
export type RoadStyle = "trail" | "streets" | "grid";

/**
 * Everything a settlement scale contributes to generation (ADR 0004 §7.4):
 * road layout, lot sizes, building counts and heights, clutter density and
 * how often ramps break up plateau edges.
 */
export interface SettlementDefinition {
  readonly id: SettlementScale;
  readonly roadStyle: RoadStyle;
  /** Side streets for `streets`; ignored by other styles. */
  readonly sideStreets: IntRange;
  /** Block edge length in tiles for `grid`; ignored by other styles. */
  readonly blockSize: number;
  /**
   * How far each grid line may drift from `blockSize` spacing, in tiles,
   * drawn per line so blocks vary; 0 keeps a regular grid.
   */
  readonly blockJitter: number;
  /**
   * Lanes per road. The `grid` builder lays this many adjacent lines per
   * grid line; `trail` and `streets` are always one lane wide.
   */
  readonly roadWidth: number;
  /** True when roads use the biome's paved surface, else its trail surface. */
  readonly pavedRoads: boolean;
  /** True when road-flanking columns become sidewalk. */
  readonly sidewalks: boolean;
  /** Width (along the road) of a lot. */
  readonly lotWidth: IntRange;
  /** Depth (away from the road) of a lot. */
  readonly lotDepth: IntRange;
  /**
   * Buildings the lot pass aims for on a medium (48²) map; the target is
   * scaled by map area so large maps are not empty and small ones are
   * not crammed.
   */
  readonly buildingCount: IntRange;
  /** Floors per building, clamped by the template. */
  readonly floorCount: IntRange;
  /** Street props per 100 road columns. */
  readonly streetPropDensity: number;
  /** Low-cover clutter per 100 open columns beside buildings and sidewalks. */
  readonly yardPropDensity: number;
  /** Maximum columns between ramps along a plateau edge. */
  readonly rampSpacing: number;
  /**
   * Raised outdoor features the elevation pass aims for on a medium
   * (48²) map, scaled by area like `buildingCount`. Unset means none: a
   * settlement whose terrain already carries height does not need them
   * (#512).
   */
  readonly elevatedFeatures?: IntRange;
}
