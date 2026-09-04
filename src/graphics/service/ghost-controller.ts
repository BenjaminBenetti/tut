import type { Camera, Object3D } from "three";
import { Vector3 } from "three";

import type { FrameUpdatable } from "../model/frame-updatable";
import type { GhostUniforms } from "./ghost-cutaway";
import { MAX_GHOSTS } from "./ghost-cutaway";

// ===========================================
// Types
// ===========================================

/** Where the units to keep visible are, in world space, newest first. */
export type GhostSource = () => readonly Object3D[];

// ===========================================
// Controller
// ===========================================

/**
 * Keeps the cutaway's centres pointed at the units the player should be
 * able to see (#526).
 *
 * ```
 *   every frame:  source() ──► world positions ──► × camera.matrixWorldInverse
 *                                                  └──► view space ──► uniforms
 * ```
 *
 * The centres are the **objects the scene is already drawing** rather
 * than a list of unit ids read from the mission. That is deliberate: the
 * renderer only builds objects for units the player may see, so ghosting
 * can never cut away a wall around a bug that vision rules hide
 * (ADR 0006). It also means a unit that dies mid-frame takes its cutaway
 * with it, with no bookkeeping.
 *
 * Cost is one matrix multiply per ghosted unit per frame — the deployed
 * force, not the map — and one uniform write shared by every ghosted
 * material.
 */
export class GhostController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly camera: Camera;
  private readonly source: GhostSource;
  private readonly uniforms: GhostUniforms;
  private readonly scratch = new Vector3();

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param camera - The camera the cutaway is measured against.
   * @param source - Yields the objects to keep visible; called per frame.
   * @param uniforms - The block every ghosted material shares.
   */
  constructor(camera: Camera, source: GhostSource, uniforms: GhostUniforms) {
    this.camera = camera;
    this.source = source;
    this.uniforms = uniforms;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Refreshes the centres from the current camera and unit positions.
   *
   * @param _deltaSeconds - Unused; the effect follows state, not time.
   */
  update(_deltaSeconds: number): void {
    const objects = this.source();
    const count = Math.min(objects.length, MAX_GHOSTS);
    this.camera.updateMatrixWorld();
    for (let i = 0; i < count; i++) {
      const object = objects[i];
      const centre = this.uniforms.uGhostCentres.value[i];
      if (object === undefined || centre === undefined) {
        continue;
      }
      object.getWorldPosition(this.scratch);
      // View space is what the shader compares in, so the projection is
      // done once here rather than per fragment.
      centre.copy(this.scratch).applyMatrix4(this.camera.matrixWorldInverse);
    }
    this.uniforms.uGhostCount.value = count;
  }
}
