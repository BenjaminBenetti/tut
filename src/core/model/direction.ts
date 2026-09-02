/**
 * The four cardinal directions on the map plane. `n` is -z, `s` is +z,
 * `e` is +x, `w` is -x. Diagonals are a tactical rule, not a core one.
 */
export type Direction = "n" | "e" | "s" | "w";

/** Every direction, in clockwise order starting north. */
export const DIRECTIONS: readonly Direction[] = ["n", "e", "s", "w"];
