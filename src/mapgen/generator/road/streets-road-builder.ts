import type { ColumnCoord } from "../../model/road";
import type { RoadBuilder, RoadBuilderContext, RoadLine } from "./road-builder";
import {
  clampInt,
  crossingAxis,
  dryLateralRange,
  isDry,
  toColumn,
} from "./road-builder";

// ===========================================
// Constants
// ===========================================

/** Side streets shorter than this are dropped. */
const MIN_SIDE_STREET = 3;

/** How far a side street may drift from its even spacing slot. */
const SLOT_JITTER = 0.5;

/** Probability that side streets alternate sides rather than repeat one. */
const ALTERNATE_CHANCE = 0.8;

// ===========================================
// StreetsRoadBuilder
// ===========================================

/**
 * Town road style: a straight main street across the map along its longer
 * axis, plus a few side streets leaving it at right angles and running to
 * the map edge or the shoreline, whichever comes first (ADR 0004 §7.3).
 *
 * ```
 *        |        |
 *   =====+========+=====   main street
 *              |
 *              |
 * ```
 */
export class StreetsRoadBuilder implements RoadBuilder {
  // ===========================================
  // Fields
  // ===========================================

  /** Streets follow the terrain in chunks like trails do. */
  readonly levelling = "follow" as const;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Lays the main street first so junctions inherit its level. */
  build(context: RoadBuilderContext): RoadLine[] {
    const { draft, settlement, rng } = context;
    const axis = crossingAxis(draft, draft.width >= draft.depth ? "x" : "z");
    const { lo, hi } = dryLateralRange(draft, axis);
    if (lo === -1) {
      return [];
    }
    const alongLength = axis === "z" ? draft.depth : draft.width;
    const lateralLength = axis === "z" ? draft.width : draft.depth;
    const margin = Math.floor((hi - lo) / 4);
    const mainLateral = rng.nextInt(lo + margin, hi - margin);

    const main: ColumnCoord[] = [];
    for (let along = 0; along < alongLength; along++) {
      main.push(toColumn(axis, along, mainLateral));
    }
    const lines: RoadLine[] = [{ columns: main }];

    const count = rng.nextInt(
      settlement.sideStreets.min,
      settlement.sideStreets.max,
    );
    const slot = alongLength / (count + 1);
    let side = rng.pick([1, -1]);
    for (let i = 0; i < count; i++) {
      const along = clampInt(
        slot * (i + 1) + (rng.next() - 0.5) * slot * SLOT_JITTER,
        1,
        alongLength - 2,
      );
      if (rng.chance(ALTERNATE_CHANCE)) {
        side = -side;
      }
      const columns: ColumnCoord[] = [];
      for (
        let lateral = mainLateral + side;
        lateral >= 0 && lateral < lateralLength;
        lateral += side
      ) {
        const column = toColumn(axis, along, lateral);
        if (!isDry(draft, column.x, column.z)) {
          break;
        }
        columns.push(column);
      }
      if (columns.length >= MIN_SIDE_STREET) {
        lines.push({ columns });
      }
    }
    return lines;
  }
}
