/**
 * Integer position on the tactical grid. `x` runs east, `z` runs south,
 * and `y` is the vertical level index (one level per storey). The
 * semantics of a level are the consumer's business; core only carries
 * integer coordinates.
 *
 * ```
 *          y (level, up)
 *          │
 *          │
 *          └──────── x (east)
 *         ╱
 *        z (south)
 * ```
 */
export interface GridPos {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Two-component vector for screen and map-plane math. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Three-component vector for world-space math. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Axis-aligned rectangle on the map plane, in tiles. */
export interface Rect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
}
