import type { Rect, Vec3 } from "../../core/model/grid";
import type {
  CameraProjection,
  CameraState,
  YawIndex,
  ZoomRange,
} from "../model/camera-state";
import {
  CAMERA_ZOOM,
  DEFAULT_CAMERA_STATE,
  ISOMETRIC_PROJECTION,
  YAW_COUNT,
  ZOOM_FIT_FLOOR,
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

/** How much map there is to frame, in tiles and levels. */
export interface MapExtent {
  /** Tiles along `+x`. */
  readonly width: number;
  /** Tiles along `+z`. */
  readonly depth: number;
  /** Levels of vertical relief above the ground plane; 0 for a flat plate. */
  readonly height: number;
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
export function projectionOf(state: CameraState): CameraProjection {
  return state.projection ?? ISOMETRIC_PROJECTION;
}

/**
 * The world direction that points up the screen: the ground plane's
 * screen-up axis for a camera looking straight down, and world `+y` for
 * any tilted camera, which is what three's `lookAt` wants as its hint.
 */
export function screenUpVector(state: CameraState): Vec3 {
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
  overrides: Partial<CameraState> = {},
): CameraState {
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
  state: CameraState,
  bounds: Rect | undefined,
): CameraState {
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
export function rotateYaw(state: CameraState, turn: YawTurn): CameraState {
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

/** Clamps a zoom value into `range`, or into `CAMERA_ZOOM` without one. */
export function clampZoom(zoom: number, range?: ZoomRange): number {
  const limits = range ?? CAMERA_ZOOM;
  return Math.min(limits.max, Math.max(limits.min, zoom));
}

/**
 * The largest pixels-per-tile at which the whole of `extent` still fits
 * inside `viewport` (#828, ADR 0009 §2.3).
 *
 * The frustum spans `viewport.width / zoom` world units across the view
 * (`orthoFrustum`), so fitting is a question of how much of the image
 * plane the map covers at one unit per tile.
 *
 * ```
 *   camera on a diagonal, elevation θ
 *
 *   screen-right  ── the (x − z) ground diagonal, unforeshortened
 *   screen-up     ── the (x + z) ground diagonal, × sin θ
 *                    plus relief, × cos θ
 *
 *   a w × d map spans (w + d) / √2 along each diagonal
 * ```
 *
 * Both diagonals matter: a square map is as wide as it is tall in tiles
 * but its screen height is foreshortened, so the width usually binds on
 * a 16:9 viewport and the height binds on a tall one. Relief is added
 * rather than ignored, or a map of towers would fit on paper and have
 * its roofs cut off.
 *
 * @param extent - Map size in tiles and levels.
 * @param viewport - Render surface in CSS pixels.
 * @param projection - Camera projection; defaults to the isometric one.
 * @returns Pixels per tile, unclamped — callers apply their own floor.
 */
export function zoomToFit(
  extent: MapExtent,
  viewport: Viewport,
  projection: CameraProjection = ISOMETRIC_PROJECTION,
): number {
  const diagonal = (extent.width + extent.depth) / Math.SQRT2;
  const sin = Math.sin(projection.elevationRad);
  const cos = Math.cos(projection.elevationRad);
  const acrossUnits = diagonal;
  const upUnits = diagonal * sin + Math.max(0, extent.height) * cos;
  if (acrossUnits <= 0 || upUnits <= 0) {
    return CAMERA_ZOOM.max;
  }
  return Math.min(viewport.width / acrossUnits, viewport.height / upUnits);
}

/**
 * Zoom limits for one map in one viewport: out far enough to see the
 * whole thing, in close enough to read a squad.
 *
 * The far end is `zoomToFit` floored at {@link ZOOM_FIT_FLOOR}, and
 * never zooms *out* past `CAMERA_ZOOM.min` on a small map — a 32-tile
 * map already fits at the default minimum, and letting it go further
 * would zoom out into empty space rather than show more map.
 *
 * @param extent - Map size in tiles and levels.
 * @param viewport - Render surface in CSS pixels.
 * @param projection - Camera projection; defaults to the isometric one.
 * @returns The range to clamp this scene's zoom into.
 */
export function zoomRangeFor(
  extent: MapExtent,
  viewport: Viewport,
  projection: CameraProjection = ISOMETRIC_PROJECTION,
): ZoomRange {
  const fit = zoomToFit(extent, viewport, projection);
  const min = Math.min(CAMERA_ZOOM.min, Math.max(ZOOM_FIT_FLOOR, fit));
  return { min, max: CAMERA_ZOOM.max };
}

/**
 * Returns a state clamped into `range` from now on, or back to
 * `CAMERA_ZOOM` with `undefined`. The current zoom is re-clamped, so a
 * viewport resize that narrows the range pulls the camera into it
 * rather than leaving it outside.
 */
export function withZoomRange(
  state: CameraState,
  range: ZoomRange | undefined,
): CameraState {
  if (range === undefined) {
    const { zoomRange: _dropped, ...rest } = state;
    return { ...rest, zoom: clampZoom(state.zoom) };
  }
  const copy: ZoomRange = { min: range.min, max: range.max };
  return { ...state, zoomRange: copy, zoom: clampZoom(state.zoom, copy) };
}

/**
 * Multiplies the zoom by `factor` and clamps the result. Factors above 1
 * zoom in (more pixels per tile); factor 1 leaves the state unchanged.
 *
 * @throws {RangeError} When `factor` is not a positive finite number.
 */
export function zoomBy(state: CameraState, factor: number): CameraState {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(
      `Zoom factor must be a positive finite number, got ${factor}`,
    );
  }
  return { ...state, zoom: clampZoom(state.zoom * factor, state.zoomRange) };
}

// ===========================================
// Target
// ===========================================

/** Returns a state looking at `target`, clamped into the bounds; the point is copied, not aliased. */
export function retarget(state: CameraState, target: Vec3): CameraState {
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
  state: CameraState,
  screenDx: number,
  screenDy: number,
): CameraState {
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
export function cameraPosition(state: CameraState, distance: number): Vec3 {
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
  state: CameraState,
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
