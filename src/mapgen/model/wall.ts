// ===========================================
// Walls
// ===========================================

/**
 * A thin wall on one edge of a tile (ADR 0004 §4.2). `solid` and `window`
 * block movement for every class; `door` is passable by infantry only.
 * Tactical decides what each kind does to line of sight.
 */
export type WallKind = "solid" | "window" | "door";

/**
 * Walls on the four edges of a tile. A missing key means no wall. The same
 * wall is stored on both tiles that share the edge; symmetry is invariant
 * I3 and is checked by the validator rather than trusted.
 */
export interface WallSet {
  readonly n?: WallKind;
  readonly e?: WallKind;
  readonly s?: WallKind;
  readonly w?: WallKind;
}

/** Shared empty wall set for tiles with no walls. */
export const NO_WALLS: WallSet = Object.freeze({});
