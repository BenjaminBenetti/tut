import type { PropKindId } from "./prop";

// ===========================================
// Room furnishing
// ===========================================

/**
 * A room's furnishing budget and purposeful arrangements. Keyed by room
 * kind so adding a use or a layout is a content change.
 */
export interface RoomFurnishing {
  /** The room kind this applies to. */
  readonly id: string;
  /** Floor tiles per prop; a room's quota is `floor(area / tilesPerProp)`. */
  readonly tilesPerProp: number;
  /** Most props one room receives. */
  readonly maxProps: number;
  /** Narrow circulation spaces remain bare below this width in tiles. */
  readonly minimumRoomWidth?: number;
  /** All kinds used by its arrangements; each permits interior placement. */
  readonly props: readonly PropKindId[];
  /** One seeded arrangement is selected per room; absent uses wall furniture. */
  readonly arrangements?: readonly RoomArrangement[];
}

/** An ordered set of functional groups, essentials before decoration. */
export interface RoomArrangement {
  readonly groups: readonly FurnishingGroup[];
}

/** Geometric relationship between a furnishing group and its room. */
export type FurnishingZone = "wall" | "corner" | "center" | "aisle" | "counter";

/** Furniture positioned in a geometric relationship to the room. */
export interface FurnishingGroup {
  /** Alternatives for this group, selected once so a row stays coherent. */
  readonly props: readonly PropKindId[];
  readonly zone: FurnishingZone;
  /** Alternative for essentials that cannot fit their preferred position. */
  readonly fallbackZone?: FurnishingZone;
  /** A staffed counter needs an open cell on both sides. */
  readonly rearAccess?: boolean;
  /** Maximum pieces in this group, still limited by the overall room budget. */
  readonly count: number;
  /** Separation along a wall or row; 1 creates a continuous run of shelving. */
  readonly spacing?: number;
}
