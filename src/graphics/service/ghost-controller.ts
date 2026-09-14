import type { Camera } from "three";
import { Vector3 } from "three";

import type { FrameUpdatable } from "../model/frame-updatable";
import type { GhostSubject, GhostUniforms } from "./ghost-cutaway";
import {
  GHOST_SAMPLES,
  ghostReach,
  ghostSamples,
  MAX_GHOSTS,
} from "./ghost-cutaway";

// ===========================================
// Types
// ===========================================

/** The units to keep visible, newest first: where each is drawn and how big it is. */
export type GhostSource = () => readonly GhostSubject[];

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
 *   every frame:  source() ──► feet, footprint, height ──► × camera.matrixWorldInverse
 *                                    │                     └──► view-space box edges
 *                                    │                            └──► ghostSamples ──► uGhostSpots
 *                                    │                                   └──► ghostReach ──► uGhostReach
 *                                    └──► world y (the feet) ──► uGhostFeet
 * ```
 *
 * The centres are the **objects the scene is already drawing** rather
 * than a list of unit ids read from the mission. That is deliberate: the
 * renderer only builds objects for units the player may see, so ghosting
 * can never cut away a wall around a bug that vision rules hide
 * (ADR 0006). It also means a unit that dies mid-frame takes its cutaway
 * with it, with no bookkeeping.
 *
 * Cost is four matrix multiplies and eleven sample points per ghosted
 * unit per frame — the deployed force, not the map — and one uniform
 * write shared by every ghosted material. The samples are built here
 * rather than in the shader because here they are built once per unit,
 * and there they were built once per unit *per fragment* (#1134).
 */
export class GhostController implements FrameUpdatable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly camera: Camera;
  private readonly source: GhostSource;
  private readonly uniforms: GhostUniforms;
  private readonly scratch = new Vector3();
  private readonly edge = new Vector3();
  private readonly right = new Vector3();
  private readonly forward = new Vector3();
  private readonly up = new Vector3();
  /** Object each slot is tracking, so a ramp follows its own unit. */
  private readonly slots: (GhostSubject["object"] | undefined)[] = [];

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
    const subjects = this.source();
    const count = Math.min(subjects.length, MAX_GHOSTS);
    this.camera.updateMatrixWorld();
    const step = deltaSeconds / FADE_SECONDS;
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const subject = i < count ? subjects[i] : undefined;
      const object = subject?.object;
      const centre = this.uniforms.uGhostCentres.value[i];
      const previous = this.slots[i];
      if (
        subject !== undefined &&
        object !== undefined &&
        centre !== undefined
      ) {
        object.getWorldPosition(this.scratch);
        // A unit's object stands on its tile, so its world height is the
        // height of its feet: the plane below which nothing ghosts (#1118).
        this.uniforms.uGhostFeet.value[i] = this.scratch.y;
        // View space is what the shader compares in, so the projection is
        // done once here rather than per fragment: the feet centre, the
        // box edges, and from them the sample points the rays leave from
        // and the circle that bounds them (#1134).
        centre.copy(this.scratch).applyMatrix4(this.camera.matrixWorldInverse);
        this.edgeInView(
          this.scratch,
          centre,
          subject.halfWidth,
          0,
          0,
          this.right,
        );
        this.edgeInView(
          this.scratch,
          centre,
          0,
          0,
          subject.halfWidth,
          this.forward,
        );
        this.edgeInView(this.scratch, centre, 0, subject.height, 0, this.up);
        this.writeSamples(i, centre);
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

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Writes a world-space edge from `feet` into `target`, in view space:
   * the view position of the edge's far end less the view position of
   * the feet. Done as a difference of points rather than a transformed
   * direction because three's `transformDirection` normalises, and the
   * samples need the edge's length.
   */
  private edgeInView(
    feet: Vector3,
    centre: Vector3,
    dx: number,
    dy: number,
    dz: number,
    target: Vector3,
  ): void {
    this.edge
      .set(feet.x + dx, feet.y + dy, feet.z + dz)
      .applyMatrix4(this.camera.matrixWorldInverse);
    target.copy(this.edge).sub(centre);
  }

  /**
   * Fills slot `slot` of the flat spots uniform with the ghost's sample
   * points, in `ghostSamples` order, and its reach with the circle that
   * bounds them (#1134). The shader indexes the same way:
   * `uGhostSpots[i * GHOST_SAMPLES + s]`.
   */
  private writeSamples(slot: number, centre: Vector3): void {
    const spots = ghostSamples(centre, this.right, this.forward, this.up);
    const base = slot * GHOST_SAMPLES;
    for (let s = 0; s < GHOST_SAMPLES; s++) {
      const spot = spots[s];
      const target = this.uniforms.uGhostSpots.value[base + s];
      if (spot !== undefined && target !== undefined) {
        target.set(spot.x, spot.y, spot.z);
      }
    }
    this.uniforms.uGhostReach.value[slot] = ghostReach(
      centre,
      spots,
      this.uniforms.uGhostRadius.value,
    );
  }
}
