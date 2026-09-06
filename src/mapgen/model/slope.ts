import type { Rotation } from "./prop";

// ===========================================
// Slope
// ===========================================

/**
 * The three pieces a hillside is built from (#799, #798). A slope tile is
 * the *lower* tile of a one-level natural step: its top surface rises
 * from the low edge to the high edge, so a unit standing on it is at the
 * low level and walks up onto the high neighbour.
 *
 * ```
 *   straight      inner corner        outer corner
 *   ▓▓▓▓▓▓        ▓▓▓▓▓▓              ▓▓▓
 *   ░/░/░/        ▓▓/░/░/             ▓▓▓  ◢     the wedge falls away
 *                 ▓▓/                 ░/░/       on two sides
 * ```
 */
export type SlopeKind = "straight" | "inner" | "outer";

/**
 * Where the high side is, in quarter turns clockwise, on the same
 * convention as a stairs tile's model (`stairsTurns`, #766):
 *
 * ```
 *   turns   straight: high side   inner: the two high sides   outer: high diagonal
 *   0       south (+z)            south and west              south-west
 *   1       west  (−x)            west and north              north-west
 *   2       north (−z)            north and east              north-east
 *   3       east  (+x)            east and south              south-east
 * ```
 *
 * The material is the tile's own `surface`, not repeated here.
 */
export interface Slope {
  readonly kind: SlopeKind;
  readonly turns: Rotation;
}
