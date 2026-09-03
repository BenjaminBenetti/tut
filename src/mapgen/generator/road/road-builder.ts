import type { Direction } from "../../../core/model/direction";
import type { Rng } from "../../../core/model/rng";
import { SurfaceIds } from "../../data/surfaces";
import type { MapDraft } from "../../model/map-draft";
import type { ColumnCoord } from "../../model/road";
import type { SettlementDefinition } from "../../model/settlement-definition";

// ===========================================
// Types
// ===========================================

/**
 * A road's geometry before levelling: an ordered, 4-connected list of
 * columns. Builders emit lines; the road pass levels them, paints
 * surfaces and sidewalks, and records segments.
 */
export interface RoadLine {
  readonly columns: readonly ColumnCoord[];
}

/** What a builder may read while laying out roads. */
export interface RoadBuilderContext {
  readonly draft: MapDraft;
  readonly settlement: SettlementDefinition;
  readonly rng: Rng;
}

/**
 * How the pass levels a builder's lines: `follow` keeps chunks within one
 * level of their neighbours so a trail climbs hills; `flat` grades the
 * whole network, and the plat it encloses, to one level, as a city would.
 */
export type RoadLevelling = "follow" | "flat";

/**
 * Lays out the road network for one `RoadStyle` (ADR 0004 §7.3, pass 3).
 * One builder per style keeps the pass Open/Closed: a new style is a new
 * builder registered in the pass, never an edit to an existing one.
 */
export interface RoadBuilder {
  readonly levelling: RoadLevelling;

  /**
   * Returns the lines of the network. Lines must avoid water and stay in
   * bounds; the pass drops anything that is not, but relies on builders
   * for shape.
   */
  build(context: RoadBuilderContext): RoadLine[];
}

/** Which map axis a line runs along. */
export type Axis = "x" | "z";

// ===========================================
// Helpers shared by builders
// ===========================================

/** True when the column is on the map and not water. */
export function isDry(draft: MapDraft, x: number, z: number): boolean {
  return (
    draft.inBounds(x, z) && draft.groundSurfaceAt(x, z) !== SurfaceIds.WATER
  );
}

/**
 * Edges that water runs along: at least half of the edge's columns are
 * water. A band along one edge also wets the corners of the two
 * neighbouring edges, which must not count.
 */
export function waterEdges(draft: MapDraft): Direction[] {
  const edges: Direction[] = [];
  const wet = (columns: readonly ColumnCoord[]): boolean =>
    columns.filter((c) => !isDry(draft, c.x, c.z)).length * 2 >= columns.length;
  const xs = [...Array(draft.width).keys()];
  const zs = [...Array(draft.depth).keys()];
  if (wet(xs.map((x) => ({ x, z: 0 })))) edges.push("n");
  if (wet(xs.map((x) => ({ x, z: draft.depth - 1 })))) edges.push("s");
  if (wet(zs.map((z) => ({ x: 0, z })))) edges.push("w");
  if (wet(zs.map((z) => ({ x: draft.width - 1, z })))) edges.push("e");
  return edges;
}

/**
 * Picks the axis a crossing road should run along so it never has to
 * cross water: water along `w`/`e` means run north–south, along `n`/`s`
 * means run east–west. With no water the caller's preference wins.
 */
export function crossingAxis(draft: MapDraft, preferred: Axis): Axis {
  const edges = waterEdges(draft);
  if (edges.includes("w") || edges.includes("e")) {
    return "z";
  }
  if (edges.includes("n") || edges.includes("s")) {
    return "x";
  }
  return preferred;
}

/**
 * Lateral positions (perpendicular to `axis`) whose entire run along the
 * axis is dry, as an inclusive `[lo, hi]` range. Water is a band along one
 * edge, so the dry positions form one contiguous range.
 */
export function dryLateralRange(
  draft: MapDraft,
  axis: Axis,
): { lo: number; hi: number } {
  const lateralLength = axis === "z" ? draft.width : draft.depth;
  const alongLength = axis === "z" ? draft.depth : draft.width;
  let lo = -1;
  let hi = -1;
  for (let lateral = 0; lateral < lateralLength; lateral++) {
    let dry = true;
    for (let along = 0; along < alongLength; along++) {
      const { x, z } = toColumn(axis, along, lateral);
      if (!isDry(draft, x, z)) {
        dry = false;
        break;
      }
    }
    if (dry) {
      if (lo === -1) lo = lateral;
      hi = lateral;
    }
  }
  return { lo, hi };
}

/** Maps (along, lateral) on an axis to a map column. */
export function toColumn(
  axis: Axis,
  along: number,
  lateral: number,
): ColumnCoord {
  return axis === "z" ? { x: lateral, z: along } : { x: along, z: lateral };
}

/**
 * Advances a line one step along the axis while moving laterally from
 * `fromLateral` to `toLateral`, keeping it 4-connected: the column at
 * `(along, fromLateral)` is added first, then every lateral column up to
 * and including `(along, toLateral)`.
 */
export function appendStep(
  columns: ColumnCoord[],
  axis: Axis,
  along: number,
  fromLateral: number,
  toLateral: number,
): void {
  columns.push(toColumn(axis, along, fromLateral));
  const step = toLateral > fromLateral ? 1 : -1;
  for (let lateral = fromLateral; lateral !== toLateral; lateral += step) {
    columns.push(toColumn(axis, along, lateral + step));
  }
}

/** Clamps a number into an inclusive range. */
export function clampInt(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(value)));
}
