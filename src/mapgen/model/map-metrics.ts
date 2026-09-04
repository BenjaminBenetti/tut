// ===========================================
// Map metrics
// ===========================================

/**
 * Tuning read-outs over a finished map (plain data). Shares are in
 * [0, 1]; "per 100" values are per 100 exterior ground tiles. Baselines
 * measured on 2026-09-03 over 24 medium seeds per scale: cover adjacency
 * 0.20 (rural, town) to 0.24 (city), wall adjacency 0.01 / 0.06 / 0.11,
 * interior props per building about 2.7, hatch space 15–18 of 25. The
 * directional cover shares were measured on 2026-09-04 over 6 medium
 * seeds per biome × scale: covered 0.15–0.20 (rural), 0.21–0.25 (town),
 * 0.29–0.36 (city); flank-proof 0.03–0.06 everywhere (#432).
 */
export interface MapMetrics {
  /** Exterior, non-water tiles. */
  readonly groundTiles: number;
  /** Ground tiles infantry can stand on. */
  readonly openTiles: number;
  /** Share of open tiles with a cover prop on a 4-neighbour. */
  readonly coverAdjacency: number;
  /** Share of open tiles with a wall on any edge. */
  readonly wallAdjacency: number;
  /**
   * Mean number of an open tile's four sides that give cover, in [0, 4].
   * A side gives cover when the tile carries a wall on that edge or the
   * same-level neighbour there provides cover — what `coverAgainst`
   * reads when a shot arrives from that side.
   */
  readonly coveredSidesMean: number;
  /** Share of open tiles with cover on at least one side. */
  readonly coveredShare: number;
  /**
   * Share of open tiles with cover on at least two sides: a position that
   * still holds when the attack comes from a second direction.
   */
  readonly flankProofShare: number;
  /** High-cover tiles per 100 ground tiles. */
  readonly highCoverPer100: number;
  /** Low-cover tiles per 100 ground tiles. */
  readonly lowCoverPer100: number;
  /** Props inside buildings divided by buildings (0 with none). */
  readonly interiorPropsPerBuilding: number;
  readonly ramps: number;
  readonly stairs: number;
  readonly ladders: number;
  /** Most floors any building has (0 with none). */
  readonly maxFloors: number;
  /** Fewest infantry-reachable tiles within an objective's hatch radius (0 with none). */
  readonly hatchSpaceMin: number;
  /** Mean of the same over objectives that declare a hatch radius. */
  readonly hatchSpaceMean: number;
}
