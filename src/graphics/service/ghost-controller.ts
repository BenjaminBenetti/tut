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

/** Seconds a cutaway takes to open or close (style guide §12.4). */
const FADE_SECONDS = 0.15;

/** Keeps `value` inside `[low, high]`. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

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
  /** Object each centre slot is tracking, so a ramp follows its own unit. */
  private readonly slots: (Object3D | undefined)[] = [];

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
   * @param deltaSeconds - Frame delta, which drives the fade ramp.
   */
  update(deltaSeconds: number): void {
    const objects = this.source();
    const count = Math.min(objects.length, MAX_GHOSTS);
    this.camera.updateMatrixWorld();
    const step = deltaSeconds / FADE_SECONDS;
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const object = i < count ? objects[i] : undefined;
      const centre = this.uniforms.uGhostCentres.value[i];
      const previous = this.slots[i];
      if (object !== undefined && centre !== undefined) {
        object.getWorldPosition(this.scratch);
        // View space is what the shader compares in, so the projection is
        // done once here rather than per fragment.
        centre.copy(this.scratch).applyMatrix4(this.camera.matrixWorldInverse);
      }
      // A slot that changed hands starts from nothing, or the new unit
      // inherits the old one's ramp and the cutaway appears to jump.
      const strength =
        object !== previous && object !== undefined
          ? 0
          : (this.uniforms.uGhostStrength.value[i] ?? 0);
      const target = object === undefined ? 0 : 1;
      this.uniforms.uGhostStrength.value[i] = clamp(
        strength + Math.sign(target - strength) * step,
        0,
        1,
      );
      this.slots[i] = object;
    }
    // A slot still fading out has to stay in the loop's range.
    this.uniforms.uGhostCount.value = this.uniforms.uGhostStrength.value.reduce(
      (live, value, index) => (value > 0 ? index + 1 : live),
      count,
    );
  }
}
