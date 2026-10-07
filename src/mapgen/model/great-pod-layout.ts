import type { ColumnCoord } from "./road";

// ===========================================
// Great pod layout
// ===========================================

/**
 * Which pair of opposite sides the great pod's inner passages open to
 * (#1238): `ns` opens the membrane north and south, `ew` east and west.
 * The hull's soft seams sit on the same axis, in line with the mouths.
 */
export type GreatPodAxis = "ns" | "ew";

/**
 * What a chamber of the great pod is (#1238):
 *
 * - `route`: an outer chamber on the mouth axis, whose mouth opens into
 *   the core chamber; a breach into it is one breach to the core.
 * - `side`: an outer chamber off the axis, sealed from the core by the
 *   membrane; a breach into it needs a second breach to go on.
 * - `core`: the chamber round the core itself.
 */
export type GreatPodChamberRole = "route" | "side" | "core";

/** One chamber of the great pod, where a brood sleeps. */
export interface GreatPodChamber {
  /** `pod-north`, `pod-east`, `pod-south`, `pod-west` or `pod-core`. */
  readonly id: string;
  readonly role: GreatPodChamberRole;
  /** The chamber's middle on the floor: its brood hook's tile. */
  readonly centre: ColumnCoord;
  /** The brood's reach from `centre`, in tiles (brood hook `meta.radius`). */
  readonly radius: number;
}

/**
 * The plan a great pod was laid from (#1238), kept on the draft so the
 * pod pass, the core placer and the chamber pass read one geometry.
 * Never frozen into the `TacticalMap`: props, surfaces and hooks carry
 * what the mission needs.
 *
 * A great pod is a spore pod scaled up into a structure: a round hull of
 * plates with no way in, an inner membrane round the core chamber with
 * two mouths, and four ribs that cut the ring between them into four
 * outer chambers. Only the two chambers on the mouth axis open on the
 * core; the hull's soft seams sit in line with them.
 *
 * ```
 *          H s s s H              H hull plate (demolition 2)
 *      H H H · · · H H H          s hull seam  (demolition 1), on the mouth axis
 *    H H r · · · · · r r H        r rib, M membrane (carapace, demolition 2)
 *    H r r · M · · · M r r H      · floor, m an open mouth
 *  H   r M M c c c M M r   H      c core chamber, C the core (3×3)
 *  H     M c C C C c M     H
 *  H  w  M c C C C c M  e  H      n/e/s/w the outer chambers;
 *  H     M c C C C c M     H      here (ns) north and south are route
 *  H     M M c c c M M     H      chambers, east and west side chambers
 *    H   r M · m m m · r H
 *      H H H · · · H H H
 *          H s s s H
 * ```
 */
export interface GreatPodLayout {
  /** The column under the middle of the core. */
  readonly centre: ColumnCoord;
  /** Ground level the pod's disc was levelled to. */
  readonly level: number;
  readonly axis: GreatPodAxis;
  /** Euclidean radius of the levelled disc: hull plus apron. */
  readonly discRadius: number;
  /** Hull plates, the seams excluded: the pod's outer wall. */
  readonly hull: readonly ColumnCoord[];
  /** The hull's soft seams, in line with the mouths. */
  readonly seams: readonly ColumnCoord[];
  /** The inner membrane round the core chamber, its mouths excluded. */
  readonly membrane: readonly ColumnCoord[];
  /** The four ribs between membrane and hull. */
  readonly ribs: readonly ColumnCoord[];
  /** The open mouths in the membrane: floor. */
  readonly mouths: readonly ColumnCoord[];
  /** Every floor column inside the hull, the core's included. */
  readonly floor: readonly ColumnCoord[];
  /** The core's square by its lowest corner, and its side. */
  readonly core: {
    readonly x: number;
    readonly z: number;
    readonly size: number;
  };
  /** Levelled ground between the hull and the disc's edge. */
  readonly apron: readonly ColumnCoord[];
  /** Apron columns next to the hull, kept clear for a breach party. */
  readonly verge: readonly ColumnCoord[];
  readonly chambers: readonly GreatPodChamber[];
}
