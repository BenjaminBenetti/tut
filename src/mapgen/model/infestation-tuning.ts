/** Art-directed spread without changing the base map or its traversal topology. */
export interface InfestationTuning {
  /** Fraction of eligible surfaces covered at each whole level, including zero. */
  readonly coverageByLevel: readonly number[];
  /** Width in tiles of the broad connected growth patches. */
  readonly patchSize: number;
}
