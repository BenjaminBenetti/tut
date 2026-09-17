// ===========================================
// Settlement variation
// ===========================================

/**
 * How one city's copy of its style × scale model is told apart from
 * its neighbours' (#1155): a mirror, a small extra yaw and a height
 * stretch, all derived from the city id so a city looks the same every
 * time it is drawn and no two cities of one style and scale match.
 */
export interface SettlementVariation {
  /** Flip the model across its north–south axis, so the layout reads reversed. */
  readonly mirrored: boolean;
  /** Extra turn about the vertical axis, radians, on top of the model's authored yaw. */
  readonly yaw: number;
  /** Multiplier on the model's height; the footprint is untouched. */
  readonly heightScale: number;
}

/** The ranges a variation is drawn from. */
export interface SettlementVariationTuning {
  /** Largest extra yaw either way, radians. */
  readonly maxYaw: number;
  /** Shortest height multiplier. */
  readonly minHeightScale: number;
  /** Tallest height multiplier. */
  readonly maxHeightScale: number;
}
