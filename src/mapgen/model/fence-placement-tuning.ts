/** Dimensions of settlement boundary runs, measured in ground columns. */
export interface FencePlacementTuning {
  readonly minRun: number;
  readonly maxRun: number;
  /** Open columns between separate runs, including their ends. */
  readonly opening: number;
  /** Distance from a fence column to the parallel trail lane. */
  readonly trailOffset: number;
  readonly maxTrailOffset: number;
  /** Search this far outside a lot edge for supported yard ground. */
  readonly yardOffset: number;
}
