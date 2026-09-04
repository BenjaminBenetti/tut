import type { Rect, Vec3 } from "../../core/model/grid";
import type {
  CameraProjection,
  IsometricCameraState,
  YawIndex,
} from "../model/camera-state";
import {
  CAMERA_ZOOM,
  DEFAULT_CAMERA_STATE,
  ISOMETRIC_PROJECTION,
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
// Projection
// ===========================================

/** Below this cosine the camera is treated as looking straight down. */
const TOP_DOWN_EPSILON = 1e-6;

/**
 * The state's projection, defaulting to isometric so every caller from
 * before #420 keeps the tactical view it was written for.
 */
export function projectionOf(state: IsometricCameraState): CameraProjection {
  return state.projection ?? ISOMETRIC_PROJECTION;
}

/**
 * The world direction that points up the screen: the ground plane's
 * screen-up axis for a camera looking straight down, and world `+y` for
 * any tilted camera, which is what three's `lookAt` wants as its hint.
 */
export function screenUpVector(state: IsometricCameraState): Vec3 {
  const projection = projectionOf(state);
  if (Math.cos(projection.elevationRad) > TOP_DOWN_EPSILON) {
    return { x: 0, y: 1, z: 0 };
  }
  return groundScreenAxes(state.yawIndex, projection).up;
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
  const bounds = overrides.bounds;
  return {
    yawIndex: overrides.yawIndex ?? DEFAULT_CAMERA_STATE.yawIndex,
    zoom: clampZoom(zoom),
    target: clampTarget(target, bounds),
    ...(bounds === undefined ? {} : { bounds: { ...bounds } }),
    ...(overrides.projection === undefined
      ? {}
      : { projection: { ...overrides.projection } }),
  };
}

// ===========================================
// Bounds
// ===========================================

/**
 * Copies `target`, clamped onto the ground-plane rectangle when one is
 * given (#218). A rectangle with no extent pins the target to its corner;
 * `y` is never touched.
 */
export function clampTarget(target: Vec3, bounds: Rect | undefined): Vec3 {
  if (bounds === undefined) {
    return { x: target.x, y: target.y, z: target.z };
  }
  return {
    x: Math.min(bounds.x + Math.max(0, bounds.w), Math.max(bounds.x, target.x)),
    y: target.y,
    z: Math.min(bounds.z + Math.max(0, bounds.d), Math.max(bounds.z, target.z)),
  };
}

/**
 * Returns a state bounded by `bounds` (or unbounded for `undefined`),
 * with the current target clamped into it at once so a pan cannot start
 * outside. The rectangle is copied, not aliased.
 *
 * @throws {RangeError} When a bound is not a finite number.
 */
export function withBounds(
  state: IsometricCameraState,
  bounds: Rect | undefined,
): IsometricCameraState {
  if (bounds === undefined) {
    const { bounds: _dropped, ...rest } = state;
    return rest;
  }
  for (const value of [bounds.x, bounds.z, bounds.w, bounds.d]) {
    if (!Number.isFinite(value)) {
      throw new RangeError(
        `Camera bounds must be finite, got ${String(value)}`,
      );
    }
  }
  const copy = { ...bounds };
  return { ...state, bounds: copy, target: clampTarget(state.target, copy) };
}

// ===========================================
// Yaw
// ===========================================

/**
 * Angle of the camera's horizontal offset from the target, measured on
 * the ground plane from +x toward +z. Yaw 0 is 45°, so the camera sits
 * on the +x +z diagonal; each step adds 90°.
 */
export function yawAngleRad(
  yawIndex: YawIndex,
  projection: CameraProjection = ISOMETRIC_PROJECTION,
): number {
  return projection.yawOffsetRad + yawIndex * (Math.PI / 2);
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
export function horizontalDirection(
  yawIndex: YawIndex,
  projection: CameraProjection = ISOMETRIC_PROJECTION,
): Vec3 {
  const angle = yawAngleRad(yawIndex, projection);
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

/**
 * Screen axes projected onto the ground plane. With the camera's
 * horizontal forward `f = -horizontalDirection` and world up `+y`,
 * screen-right is `f × up` and screen-up on the ground is `f` itself.
 */
export function groundScreenAxes(
  yawIndex: YawIndex,
  projection: CameraProjection = ISOMETRIC_PROJECTION,
): GroundScreenAxes {
  const angle = yawAngleRad(yawIndex, projection);
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

/** Returns a state looking at `target`, clamped into the bounds; the point is copied, not aliased. */
export function retarget(
  state: IsometricCameraState,
  target: Vec3,
): IsometricCameraState {
  return { ...state, target: clampTarget(target, state.bounds) };
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
 * The moved target is clamped into the state's bounds, so a held key can
 * never carry the content off screen (#218).
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
  const projection = projectionOf(state);
  const { right, up } = groundScreenAxes(state.yawIndex, projection);
  const alongRight = screenDx / state.zoom;
  const alongUp = -screenDy / (state.zoom * Math.sin(projection.elevationRad));
  return {
    ...state,
    target: clampTarget(
      {
        x: state.target.x + right.x * alongRight + up.x * alongUp,
        y: state.target.y,
        z: state.target.z + right.z * alongRight + up.z * alongUp,
      },
      state.bounds,
    ),
  };
}

// ===========================================
// Placement and projection
// ===========================================

/**
 * World position of the camera: the target plus `distance` along the
 * view direction, which is `horizontalDirection` tilted up by the
 * projection's elevation. All four yaws share one height and one
 * distance, so the camera orbits on a circle above the target; a
 * straight-down projection puts it directly overhead.
 */
export function cameraPosition(
  state: IsometricCameraState,
  distance: number,
): Vec3 {
  const projection = projectionOf(state);
  const horizontal = horizontalDirection(state.yawIndex, projection);
  const ground = distance * Math.cos(projection.elevationRad);
  return {
    x: state.target.x + ground * horizontal.x,
    y: state.target.y + distance * Math.sin(projection.elevationRad),
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
