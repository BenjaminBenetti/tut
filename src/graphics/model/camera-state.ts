import type { Vec3 } from "../../core/model/grid";

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
export interface IsometricCameraState {
  /** Diagonal the camera sits on; see {@link YawIndex}. */
  readonly yawIndex: YawIndex;
  /** Pixels per world unit. One tile is one unit, so this is pixels per tile. */
  readonly zoom: number;
  /** World-space point at the centre of the view. */
  readonly target: Vec3;
}

// ===========================================
// Constants
// ===========================================

/** Elevation above the ground plane: atan(1/√2) ≈ 35.26°, true isometric. */
export const ISOMETRIC_ELEVATION_RAD = Math.atan(1 / Math.SQRT2);

/** Zoom limits in pixels per tile (style guide §2). */
export const CAMERA_ZOOM = { min: 40, max: 128, initial: 64 } as const;

/** Number of yaw orientations; `YawIndex` runs from 0 to this minus one. */
export const YAW_COUNT = 4;

/** State used when a caller specifies nothing: yaw 0, default zoom, origin. */
export const DEFAULT_CAMERA_STATE: IsometricCameraState = {
  yawIndex: 0,
  zoom: CAMERA_ZOOM.initial,
  target: { x: 0, y: 0, z: 0 },
};
