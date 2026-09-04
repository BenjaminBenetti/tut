import type { Camera, DirectionalLight } from "three";
import { Vector3 } from "three";

import type { FrameUpdatable } from "../model/frame-updatable";

// ===========================================
// Constants
// ===========================================

/** Below this the view axis is parallel to the ground and never meets it. */
const MIN_DOWNWARD = 1e-4;

/** Moved less than this and the shadow map would redraw for nothing. */
const RETARGET_EPSILON = 0.5;

// ===========================================
// ShadowFollowController
// ===========================================

/**
 * Keeps the key light's shadow frustum over the ground the camera is
 * actually looking at.
 *
 * A `DirectionalLight` aims at the world origin, which on a 40 x 40 map
 * is a corner: with a fixed frustum the shadows are cast somewhere the
 * player is not looking and the visible street has none. The light's
 * _direction_ must not change -- the whole point of §12.1's fixed rig is
 * that a face shades the same way at every yaw -- so this moves the
 * light and its target together, keeping the offset between them.
 *
 * ```
 *   camera ──▶ forward ray ──▶ hits ground plane ──▶ centre
 *                                                     │
 *                       light.position = centre + offset
 *                       light.target   = centre        (direction unchanged)
 * ```
 *
 * The centre is where the camera's forward ray meets `y = 0`, which is
 * exact for an orthographic camera looking at a ground plane and needs
 * nothing from the camera rig beyond the three camera itself.
 */
export class ShadowFollowController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly light: DirectionalLight;
  private readonly camera: Camera;
  private readonly offset: Vector3;
  private readonly centre = new Vector3();
  private readonly forward = new Vector3();
  private readonly last = new Vector3(Infinity, Infinity, Infinity);

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param light - The shadow-casting key light; its current position is
   *   taken as the offset to hold from whatever it lights.
   * @param camera - The camera whose view the frustum follows.
   */
  constructor(light: DirectionalLight, camera: Camera) {
    this.light = light;
    this.camera = camera;
    this.offset = light.position.clone();
  }

  // ===========================================
  // FrameUpdatable
  // ===========================================

  /**
   * Re-centres the frustum if the view has moved far enough to matter.
   *
   * @param _deltaSeconds - Unused; this follows position, not time.
   */
  update(_deltaSeconds: number): void {
    if (!this.groundCentre()) {
      return;
    }
    if (this.centre.distanceTo(this.last) < RETARGET_EPSILON) {
      return;
    }
    this.last.copy(this.centre);
    this.light.position.copy(this.centre).add(this.offset);
    this.light.target.position.copy(this.centre);
    this.light.target.updateMatrixWorld();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Puts the point where the camera's forward ray meets the ground plane
   * into `centre`.
   *
   * @returns Whether the ray meets the ground at all.
   */
  private groundCentre(): boolean {
    this.camera.getWorldDirection(this.forward);
    if (this.forward.y > -MIN_DOWNWARD) {
      return false;
    }
    const distance = -this.camera.position.y / this.forward.y;
    this.centre
      .copy(this.forward)
      .multiplyScalar(distance)
      .add(this.camera.position);
    this.centre.y = 0;
    return true;
  }
}
