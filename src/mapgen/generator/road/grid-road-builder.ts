import type { ColumnCoord } from "../../model/road";
import type {
  Axis,
  RoadBuilder,
  RoadBuilderContext,
  RoadLine,
} from "./road-builder";
import { isDry, toColumn } from "./road-builder";

// ===========================================
// Constants
// ===========================================

/** Dry runs shorter than this are dropped. */
const MIN_RUN = 3;

/** Smallest block the grid will use even if the data says less. */
const MIN_BLOCK = 4;

// ===========================================
// GridRoadBuilder
// ===========================================

/**
 * City road style: streets every `blockSize` columns along both axes with
 * a small random offset, each `roadWidth` lanes wide, spanning the map
 * and broken only by water (ADR 0004 §7.3). Every lane is its own line;
 * runs that water cuts off are separate lines; the pass keeps the
 * largest connected network.
 *
 * ```
 *   ==++====++====++==
 *   ==++====++====++==     roadWidth 2
 *     ||    ||    ||
 *   ==++====++====++==
 * ```
 */
export class GridRoadBuilder implements RoadBuilder {
  // ===========================================
  // Fields
  // ===========================================

  /** Cities are graded flat. */
  readonly levelling = "flat" as const;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Lays the grid lines, one line per lane, dry runs only. */
  build(context: RoadBuilderContext): RoadLine[] {
    const { draft, settlement, rng } = context;
    const block = Math.max(MIN_BLOCK, settlement.blockSize);
    const width = Math.max(1, settlement.roadWidth);
    const lines: RoadLine[] = [];
    for (const axis of ["x", "z"] as const) {
      const lateralLength = axis === "z" ? draft.width : draft.depth;
      const half = Math.floor(block / 2);
      const offset = rng.nextInt(Math.max(1, half - 1), half + 1);
      for (
        let lateral = offset;
        lateral < lateralLength - 1;
        lateral += block
      ) {
        for (let lane = 0; lane < width; lane++) {
          if (lateral + lane < lateralLength) {
            lines.push(...dryRuns(context, axis, lateral + lane));
          }
        }
      }
    }
    return lines;
  }
}

// ===========================================
// Helpers
// ===========================================

/** Splits one grid line into its dry runs along the axis. */
function dryRuns(
  context: RoadBuilderContext,
  axis: Axis,
  lateral: number,
): RoadLine[] {
  const { draft } = context;
  const alongLength = axis === "z" ? draft.depth : draft.width;
  const runs: RoadLine[] = [];
  let run: ColumnCoord[] = [];
  const flush = (): void => {
    if (run.length >= MIN_RUN) {
      runs.push({ columns: run });
    }
    run = [];
  };
  for (let along = 0; along < alongLength; along++) {
    const column = toColumn(axis, along, lateral);
    if (isDry(draft, column.x, column.z)) {
      run.push(column);
    } else {
      flush();
    }
  }
  flush();
  return runs;
}
