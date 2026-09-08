/** World-space appearance knobs; no tactical surface ownership changes. */
export interface NaturalMaterialTransitionTuning {
  /** Baked contact samples per tile; sixteen resolves an eighth of a metre. */
  readonly samplesPerTile: number;
  /** Maximum contour displacement in tiles (one tile is two metres). */
  readonly warpAmplitude: number;
  /** Broad contour irregularity, in noise cells per tile. */
  readonly warpFrequency: number;
  /** Fine contour irregularity, relative to the broad frequency. */
  readonly detailFrequency: number;
  /** Fraction of the displacement contributed by fine noise. */
  readonly detailShare: number;
  /** Sharpens the material weights so interiors keep their distinct palette. */
  readonly sharpness: number;
}
