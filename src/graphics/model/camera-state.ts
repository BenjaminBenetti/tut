import type { Rect, Vec3 } from "../../core/model/grid";

// ===========================================
// Types
// ===========================================

/**
 * Which of the four diagonals the camera sits on. Steps are clockwise
 * 90° turns as seen from above (looking down -y onto the ground plane),
 * and the index wraps: right of 3 is 0, left of 0 is 3.
 *
 * ```
 *   seen from above · +x east (right) · +z south (down)
 *
 *          2 ·             · 3
 *              ╲         ╱
 *                 target
 *              ╱         ╲
 *          1 ·             · 0      yaw 0: camera sits toward +x +z
 *                                   and looks north-west
 * ```
 */
export type YawIndex = 0 | 1 | 2 | 3;

/**
 * Everything the isometric camera needs to place itself. Plain data:
 * the three.js rig reads it, never the other way round.
 */
export interface CameraState {
  /** Diagonal the camera sits on; see {@link YawIndex}. */
  readonly yawIndex: YawIndex;
  /** Pixels per world unit. One tile is one unit, so this is pixels per tile. */
  readonly zoom: number;
  /** World-space point at the centre of the view. */
  readonly target: Vec3;
  /**
   * Ground-plane rectangle the target is kept inside (#218), in world
   * units: `x`/`z` the near corner, `w`/`d` the extent along x and z.
   * Set by the scene that owns the content (the overworld plate, a
   * tactical map); absent means unbounded, as before.
   */
  readonly bounds?: Rect;
  /**
   * How the camera looks at the ground plane. Absent means the isometric
   * projection every tactical scene uses; the strategic map passes
   * {@link TOP_DOWN_PROJECTION} (#420).
   */
  readonly projection?: CameraProjection;
}

/**
 * How a camera is angled onto the ground plane. Two shipped projections:
 * the tilted isometric view the tactical maps are authored for (ADR 0004
 * §3) and the straight-down view the strategic map uses, where the Earth
 * plate reads as an upright rectangle with north up (#420).
 *
 * ```
 *   elevationRad          yawOffsetRad = angle of yaw index 0 from +x toward +z
 *
 *   isometric  35.26°     π/4  camera on a diagonal, screen-up is north-west
 *   top-down   90°        π/2  camera straight above, screen-up is north
 * ```
 */
export interface CameraProjection {
  /** Angle above the ground plane in radians; `π/2` looks straight down. */
  readonly elevationRad: number;
  /** Ground angle of yaw index 0's offset from the target, from `+x` toward `+z`. */
  readonly yawOffsetRad: number;
}

// ===========================================
// Constants
// ===========================================

/** Elevation above the ground plane: atan(1/√2) ≈ 35.26°, true isometric. */
export const ISOMETRIC_ELEVATION_RAD = Math.atan(1 / Math.SQRT2);

/** Elevation of a camera looking straight down at the ground plane. */
export const TOP_DOWN_ELEVATION_RAD = Math.PI / 2;

/**
 * The tactical projection: true isometric, camera on one of the four
 * diagonals. Tactical maps are authored for it (ADR 0004 §3).
 */
export const ISOMETRIC_PROJECTION: CameraProjection = {
  elevationRad: ISOMETRIC_ELEVATION_RAD,
  yawOffsetRad: Math.PI / 4,
};

/**
 * The strategic map projection (#420): straight down with the camera's
 * yaw on the axes, so north is screen-up, east is screen-right and the
 * map plate reads as an upright rectangle rather than a rhombus.
 */
export const TOP_DOWN_PROJECTION: CameraProjection = {
  elevationRad: TOP_DOWN_ELEVATION_RAD,
  yawOffsetRad: Math.PI / 2,
};

/** Zoom limits in pixels per tile (style guide §2). */
export const CAMERA_ZOOM = { min: 40, max: 128, initial: 64 } as const;

/** Number of yaw orientations; `YawIndex` runs from 0 to this minus one. */
export const YAW_COUNT = 4;

/** State used when a caller specifies nothing: yaw 0, default zoom, origin. */
export const DEFAULT_CAMERA_STATE: CameraState = {
  yawIndex: 0,
  zoom: CAMERA_ZOOM.initial,
  target: { x: 0, y: 0, z: 0 },
};
