// ===========================================
// Walls
// ===========================================

/**
 * A thin wall on one edge of a tile (ADR 0004 §4.2).
 *
 * ```
 *   kind    movement                        height
 *   solid   nobody                          full
 *   window  nobody                          full, glazed
 *   door    infantry only                   full
 *   half    infantry vaults it, mechs not   waist
 * ```
 *
 * `half` is the low-cover primitive that does not eat a tile (#508): a
 * parapet along a plaza edge or a yard boundary, which a soldier climbs
 * and a walker has to go round. Every cover prop stands *on* a tile, so
 * cover and standing room compete; an edge-mounted piece does not.
 *
 * Tactical decides what each kind does to line of sight and cover.
 */
export type WallKind = "solid" | "window" | "door" | "half";

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
