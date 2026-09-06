import type { ColumnCoord } from "../../model/road";
import { ValueNoise } from "../../service/value-noise";
import type { RoadBuilder, RoadBuilderContext, RoadLine } from "./road-builder";
import {
  appendStep,
  clampInt,
  crossingAxis,
  dryLateralRange,
  toColumn,
} from "./road-builder";

// ===========================================
// Constants
// ===========================================

/** Lattice cells per column along the trail; lower meanders more slowly. */
const MEANDER_FREQUENCY = 0.12;

/** Widest swing from the centre line, in columns. */
const MAX_AMPLITUDE = 6;

/** Largest lateral move between consecutive steps, in columns. */
const MAX_STEP = 2;

// ===========================================
// TrailRoadBuilder
// ===========================================

/**
 * Rural road style: one meandering trail from one map edge to the
 * opposite edge, wobbling around a random centre line with 1D noise and
 * never crossing water (ADR 0004 §7.3).
 *
 * ```
 *   ,,,,
 *      ,,,,,
 *          ,,,
 *        ,,,
 *      ,,,
 * ```
 */
export class TrailRoadBuilder implements RoadBuilder {
  // ===========================================
  // Fields
  // ===========================================

  /** Trails follow the terrain, one chunk at a time. */
  readonly levelling = "follow" as const;

  // ===========================================
  // Public Methods
  // ===========================================

  /** Lays one trail; returns nothing when no dry crossing exists. */
  build(context: RoadBuilderContext): RoadLine[] {
    const { draft, settlement, rng } = context;
    const lanes = Math.max(1, settlement.roadWidth);
    const axis = crossingAxis(draft, rng.pick(["x", "z"]));
    const { lo, hi: dryHi } = dryLateralRange(draft, axis);
    if (lo === -1 || dryHi - lo + 1 < lanes) {
      return [];
    }
    // `lateral` is the first lane; the band reaches `lanes - 1` further.
    const hi = dryHi - (lanes - 1);
    const alongLength = axis === "z" ? draft.depth : draft.width;
    const margin = Math.min(2, Math.floor((hi - lo) / 4));
    const centre = rng.nextInt(lo + margin, hi - margin);
    const amplitude = Math.min(MAX_AMPLITUDE, Math.floor((hi - lo) / 3));
    const noise = new ValueNoise(rng.fork("meander"));

    const columns: ColumnCoord[] = [];
    const seen = new Set<string>();
    const push = (column: ColumnCoord): void => {
      const key = `${column.x},${column.z}`;
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(column);
      }
    };
    let lateral = clampInt(
      centre + (noise.sample(0, 0.5) - 0.5) * 2 * amplitude,
      lo,
      hi,
    );
    for (let lane = 0; lane < lanes; lane++) {
      push(toColumn(axis, 0, lateral + lane));
    }
    for (let along = 1; along < alongLength; along++) {
      const target = clampInt(
        centre +
          (noise.sample(along * MEANDER_FREQUENCY, 0.5) - 0.5) * 2 * amplitude,
        lo,
        hi,
      );
      const next = clampInt(target, lateral - MAX_STEP, lateral + MAX_STEP);
      const step: ColumnCoord[] = [];
      for (let lane = 0; lane < lanes; lane++) {
        appendStep(step, axis, along, lateral + lane, next + lane);
      }
      step.forEach(push);
      lateral = next;
    }
    return [{ columns }];
  }
}
