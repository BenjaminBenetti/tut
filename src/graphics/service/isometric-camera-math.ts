import type { Vec3 } from "../../core/model/grid";
import type { IsometricCameraState, YawIndex } from "../model/camera-state";
import {
  CAMERA_ZOOM,
  DEFAULT_CAMERA_STATE,
  ISOMETRIC_ELEVATION_RAD,
  YAW_COUNT,
} from "../model/camera-state";

// ===========================================
// Types
// ===========================================

/** Direction of a 90° yaw step. `right` is clockwise seen from above. */
export type YawTurn = "left" | "right";

/** Size of the render surface in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Orthographic frustum extents in world units, centred on the view axis. */
export interface OrthoFrustum {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Unit vectors on the ground plane matching the camera's screen axes. */
export interface GroundScreenAxes {
  /** Where screen-right points on the ground. */
  readonly right: Vec3;
  /** Where screen-up points on the ground: away from the camera. */
  readonly up: Vec3;
}

// ===========================================
// Construction
// ===========================================

/**
 * Builds a state from defaults and overrides. Zoom is clamped into
 * `CAMERA_ZOOM`; the target is copied so callers cannot alias it.
 *
 * @throws {RangeError} When the zoom override is not a finite number.
 */
export function createCameraState(
  overrides: Partial<IsometricCameraState> = {},
): IsometricCameraState {
  const zoom = overrides.zoom ?? DEFAULT_CAMERA_STATE.zoom;
  if (!Number.isFinite(zoom)) {
    throw new RangeError(`Camera zoom must be a finite number, got ${zoom}`);
  }
  const target = overrides.target ?? DEFAULT_CAMERA_STATE.target;
  return {
    yawIndex: overrides.yawIndex ?? DEFAULT_CAMERA_STATE.yawIndex,
    zoom: clampZoom(zoom),
    target: { x: target.x, y: target.y, z: target.z },
  };
}

// ===========================================
// Yaw
// ===========================================

/**
 * Angle of the camera's horizontal offset from the target, measured on
 * the ground plane from +x toward +z. Yaw 0 is 45°, so the camera sits
 * on the +x +z diagonal; each step adds 90°.
 */
export function yawAngleRad(yawIndex: YawIndex): number {
  return Math.PI / 4 + yawIndex * (Math.PI / 2);
}

/** Steps the yaw one orientation left or right, wrapping 3→0 and 0→3. */
export function rotateYaw(
  state: IsometricCameraState,
  turn: YawTurn,
): IsometricCameraState {
  const step = turn === "right" ? 1 : -1;
  const yawIndex = ((((state.yawIndex + step) % YAW_COUNT) + YAW_COUNT) %
    YAW_COUNT) as YawIndex;
  return { ...state, yawIndex };
}

/** Unit vector on the ground plane pointing from the target toward the camera. */
export function horizontalDirection(yawIndex: YawIndex): Vec3 {
  const angle = yawAngleRad(yawIndex);
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

/**
 * Screen axes projected onto the ground plane. With the camera's
 * horizontal forward `f = -horizontalDirection` and world up `+y`,
 * screen-right is `f × up` and screen-up on the ground is `f` itself.
 */
export function groundScreenAxes(yawIndex: YawIndex): GroundScreenAxes {
  const angle = yawAngleRad(yawIndex);
  return {
    right: { x: Math.sin(angle), y: 0, z: -Math.cos(angle) },
    up: { x: -Math.cos(angle), y: 0, z: -Math.sin(angle) },
  };
}

// ===========================================
// Zoom
// ===========================================

/** Clamps a zoom value into `CAMERA_ZOOM`'s range. */
export function clampZoom(zoom: number): number {
  return Math.min(CAMERA_ZOOM.max, Math.max(CAMERA_ZOOM.min, zoom));
}

/**
 * Multiplies the zoom by `factor` and clamps the result. Factors above 1
 * zoom in (more pixels per tile); factor 1 leaves the state unchanged.
 *
 * @throws {RangeError} When `factor` is not a positive finite number.
 */
export function zoomBy(
  state: IsometricCameraState,
  factor: number,
): IsometricCameraState {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(
      `Zoom factor must be a positive finite number, got ${factor}`,
    );
  }
  return { ...state, zoom: clampZoom(state.zoom * factor) };
}

// ===========================================
// Target
// ===========================================

/** Returns a state looking at `target`; the point is copied, not aliased. */
export function retarget(
  state: IsometricCameraState,
  target: Vec3,
): IsometricCameraState {
  return { ...state, target: { x: target.x, y: target.y, z: target.z } };
}

/**
 * Moves the target along the ground plane by a screen-space delta in
 * pixels, so the view tracks a drag exactly. Screen-right maps through
 * the zoom alone; screen-up is foreshortened by the elevation angle, so
 * the ground distance is divided by sin(elevation).
 *
 * ```
 *   screen (px)                 ground plane, yaw 0 (seen from above)
 *   ┌───────────┐                   up ╲
 *   │     ▲ -dy │                       ╲
 *   │ ◀───┼───▶ │    ⟹                   target
 *   │     ▼ +dy │                       ╱      ╲
 *   └───────────┘                right ╱        ╲ camera
 * ```
 *
 * @param state - State to move.
 * @param screenDx - Pixels to move the view to the right.
 * @param screenDy - Pixels to move the view down (DOM convention).
 */
export function panBy(
  state: IsometricCameraState,
  screenDx: number,
  screenDy: number,
): IsometricCameraState {
  const { right, up } = groundScreenAxes(state.yawIndex);
  const alongRight = screenDx / state.zoom;
  const alongUp = -screenDy / (state.zoom * Math.sin(ISOMETRIC_ELEVATION_RAD));
  return {
    ...state,
    target: {
      x: state.target.x + right.x * alongRight + up.x * alongUp,
      y: state.target.y,
      z: state.target.z + right.z * alongRight + up.z * alongUp,
    },
  };
}

// ===========================================
// Placement and projection
// ===========================================

/**
 * World position of the camera: the target plus `distance` along the
 * view direction, which is `horizontalDirection` tilted up by
 * `ISOMETRIC_ELEVATION_RAD`. All four yaws share one height and one
 * distance, so the camera orbits on a circle above the target.
 */
export function cameraPosition(
  state: IsometricCameraState,
  distance: number,
): Vec3 {
  const horizontal = horizontalDirection(state.yawIndex);
  const ground = distance * Math.cos(ISOMETRIC_ELEVATION_RAD);
  return {
    x: state.target.x + ground * horizontal.x,
    y: state.target.y + distance * Math.sin(ISOMETRIC_ELEVATION_RAD),
    z: state.target.z + ground * horizontal.z,
  };
}

/**
 * Orthographic frustum, in world units, sized so that one world unit
 * measured across the view spans exactly `zoom` pixels: the frustum is
 * `viewport.width / zoom` wide and `viewport.height / zoom` tall.
 */
export function orthoFrustum(
  state: IsometricCameraState,
  viewport: Viewport,
): OrthoFrustum {
  const halfWidth = viewport.width / (2 * state.zoom);
  const halfHeight = viewport.height / (2 * state.zoom);
  return {
    left: -halfWidth,
    right: halfWidth,
    top: halfHeight,
    bottom: -halfHeight,
  };
}
