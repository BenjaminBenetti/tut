import { OrthographicCamera } from "three";

import type { Rect, Vec3 } from "../../core/model/grid";
import type { CameraControls } from "../model/camera-controls";
import type { IsometricCameraState } from "../model/camera-state";
import type { SceneCamera } from "../model/scene-camera";
import type { Viewport } from "./isometric-camera-math";
import {
  cameraPosition,
  createCameraState,
  orthoFrustum,
  panBy,
  retarget,
  rotateYaw,
  screenUpVector,
  withBounds,
  zoomBy,
} from "./isometric-camera-math";

// ===========================================
// Constants
// ===========================================

/** How far the camera sits from its target along the view axis, in world units. */
export const CAMERA_DISTANCE = 100;

/** Near plane, just in front of the camera. */
const NEAR_PLANE = 0.1;

/** Far plane: as far beyond the target as the camera is in front of it. */
const FAR_PLANE = CAMERA_DISTANCE * 2;

/**
 * Owns the single three.js camera in the app. Camera state lives in a
 * pure `IsometricCameraState`; the mutators only replace that state, and
 * `apply` is the one place the three camera is written.
 *
 * ```
 *   input ──▶ rotateLeft / rotateRight / zoomBy / panBy / lookAt ──▶ state
 *                                                                     │
 *   frame loop ──▶ apply() ◀───────────────────────────────────────────┘
 *                     │
 *                     ▼
 *   OrthographicCamera: position, up, lookAt, frustum, projection matrix
 * ```
 */
export class IsometricCameraRig implements CameraControls, SceneCamera {
  // ===========================================
  // Fields
  // ===========================================

  readonly camera: OrthographicCamera;
  private state: IsometricCameraState;
  private viewport: Viewport = { width: 1, height: 1 };

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Creates the rig and its camera, already synced to the initial state.
   *
   * @param initial - Overrides for yaw, zoom and target; the rest default.
   */
  constructor(initial: Partial<IsometricCameraState> = {}) {
    this.state = createCameraState(initial);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, NEAR_PLANE, FAR_PLANE);
    this.apply();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Current camera state. Immutable; a new object is produced on every change. */
  getState(): IsometricCameraState {
    return this.state;
  }

  /** Render surface size the frustum is fitted to, in CSS pixels. */
  getViewport(): Viewport {
    return this.viewport;
  }

  /** Turns the view one 90° step anticlockwise as seen from above. */
  rotateLeft(): void {
    this.state = rotateYaw(this.state, "left");
  }

  /** Turns the view one 90° step clockwise as seen from above. */
  rotateRight(): void {
    this.state = rotateYaw(this.state, "right");
  }

  /** Multiplies the zoom by `factor`, clamped to `CAMERA_ZOOM`. */
  zoomBy(factor: number): void {
    this.state = zoomBy(this.state, factor);
  }

  /** Moves the target along the ground by a screen-space delta in pixels. */
  panBy(screenDx: number, screenDy: number): void {
    this.state = panBy(this.state, screenDx, screenDy);
  }

  /** Points the camera at a world-space position, clamped into the bounds. */
  lookAt(target: Vec3): void {
    this.state = retarget(this.state, target);
  }

  /**
   * Keeps the target inside a ground-plane rectangle from now on, or
   * lifts the limit with `undefined` (#218). The scene that owns the
   * content sets this: the overworld plate, a tactical map's extent.
   */
  setBounds(bounds: Rect | undefined): void {
    this.state = withBounds(this.state, bounds);
  }

  /**
   * Records a new viewport size. The frustum is refitted on the next
   * `apply`, so one tile still spans `zoom` pixels at any size.
   */
  resize(widthPx: number, heightPx: number): void {
    this.viewport = { width: widthPx, height: heightPx };
  }

  /**
   * Pushes the state into the three camera. This is the only code that
   * mutates the camera: position, up vector, orientation, frustum and
   * projection matrix are all written here, then the world matrix is
   * refreshed so picking code sees a consistent camera immediately.
   */
  apply(): void {
    const { target } = this.state;
    const position = cameraPosition(this.state, CAMERA_DISTANCE);
    const frustum = orthoFrustum(this.state, this.viewport);

    const up = screenUpVector(this.state);

    this.camera.position.set(position.x, position.y, position.z);
    // World `+y` for a tilted camera; the ground plane's screen-up axis
    // for one looking straight down, where `+y` would be degenerate (#420).
    this.camera.up.set(up.x, up.y, up.z);
    this.camera.lookAt(target.x, target.y, target.z);

    this.camera.left = frustum.left;
    this.camera.right = frustum.right;
    this.camera.top = frustum.top;
    this.camera.bottom = frustum.bottom;
    this.camera.near = NEAR_PLANE;
    this.camera.far = FAR_PLANE;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
}
