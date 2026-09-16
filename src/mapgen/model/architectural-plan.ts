import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { Room } from "./building";
import type { IntRange } from "./settlement-definition";

/** Recognisable architectural organisations, independent of their furnishing. */
export type ArchitecturalStyle =
  "retail" | "workplace" | "residential" | "industrial";

/** Data controlling the proportions of an entrance-oriented floor plan. */
export interface ArchitecturalPlan {
  readonly style: ArchitecturalStyle;
  /** Depth of a shop's rear rooms, an industrial service block, or public rooms. */
  readonly serviceDepth: IntRange;
  /** Small service rooms may be narrower than the general room-size target. */
  readonly serviceWidth: IntRange;
  /** Clear public floor depth retained before rear service rooms. */
  readonly minimumPublicDepth: number;
}

/** A rectangular region of a reusable floor layout. */
export interface PlannedRoom {
  readonly id: string;
  readonly rect: Rect;
  readonly kind?: string;
  readonly layoutRole?: Room["layoutRole"];
  readonly layoutSlot?: string;
}

/** An interior edge segment. Missing kind is an open passage through a partition. */
export interface PlannedPartition {
  readonly x: number;
  readonly z: number;
  readonly side: Direction;
  readonly kind?: "solid" | "door";
}

/** Geometry is fixed once for every storey, preserving aligned circulation. */
export interface ArchitecturalFloorPlan {
  readonly rooms: readonly PlannedRoom[];
  readonly partitions: readonly PlannedPartition[];
}
