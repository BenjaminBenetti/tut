// ===========================================
// Crater site
// ===========================================

/**
 * Where the crater pass sank the impact bowl of a crash site, recorded on
 * the draft so later passes can find it without re-deriving it from the
 * heightmap (#1179). Generation-time scratch: the freezer does not copy
 * it into the `TacticalMap`, so it never reaches a save.
 *
 * ```
 *          rim ──────────╮           ╭────────── rimLevel
 *                        ╰──╮     ╭──╯           one ring per storey
 *                           ╰─────╯ ◄─────────── floorLevel
 *                           ◄─────►  floorRadius
 *                        ◄───────────► radius
 *                              ● centre
 * ```
 */
export interface CraterSite {
  /** Column at the middle of the bowl. */
  readonly centre: { readonly x: number; readonly z: number };
  /** Euclidean radius of the whole bowl, rim included, in columns. */
  readonly radius: number;
  /** Euclidean radius of the flat floor, in columns. */
  readonly floorRadius: number;
  /** Layer of the levelled ground the bowl is measured down from. */
  readonly rimLevel: number;
  /** Layer of the flat floor, the bowl's deepest ground. */
  readonly floorLevel: number;
}
