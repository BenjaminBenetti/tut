import type { PropKindId } from "./prop";

// ===========================================
// Room furnishing
// ===========================================

/**
 * What the prop pass puts in rooms of one kind: how many tiles each prop
 * needs, a cap per room, and which kinds to draw from. Keyed by room kind
 * in `mapgen/data/room-furnishing` so adding a room kind is a data entry.
 */
export interface RoomFurnishing {
  /** The room kind this applies to. */
  readonly id: string;
  /** Floor tiles per prop; a room's quota is `floor(area / tilesPerProp)`. */
  readonly tilesPerProp: number;
  /** Most props one room receives. */
  readonly maxProps: number;
  /** Kinds drawn uniformly; each must allow the `interior` placement. */
  readonly props: readonly PropKindId[];
}
