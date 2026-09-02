// ===========================================
// Road
// ===========================================

/** A column on the map plane. */
export interface ColumnCoord {
  readonly x: number;
  readonly z: number;
}

/**
 * One stretch of road as a polyline of columns (ADR 0004 §7.3, pass 3).
 * The lot pass walks segments to parcel land on either side; the road
 * mask on the draft is the fast lookup.
 */
export interface RoadSegment {
  readonly id: string;
  /** Columns in walking order, 4-connected. */
  readonly columns: readonly ColumnCoord[];
  /** Ground level the segment was flattened to. */
  readonly level: number;
}
