import type { Object3D } from "three";
import { Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";

import type { Direction } from "../../core/model/direction";
import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { OVERLAY_LIFT } from "../data/tactical-overlay-palette";
import type { UnitMotion } from "../model/unit-motion";
import { UnitMotionRig } from "../service/unit-motion-rig";
import type { Disposable } from "../model/disposable";
import { DEFAULT_FOOTPRINT } from "../../tactical/service/footprint-service";
import { unitFeetAt } from "../service/unit-placement";
import { DormantLook } from "./dormant-look";

// ===========================================
// Constants
// ===========================================

/** Hover and selection ring tint: `ui-accent`, the style guide's selection colour. */
export const UNIT_HIGHLIGHT_COLOUR = 0xf08a24;

/**
 * How far each ring floats above the tile top.
 *
 * The hover ring is depth-tested, so it has to clear both the ground
 * slab and every tile overlay or it z-fights them; the overlays occupy
 * `OVERLAY_LIFT` through `× 3`, so it takes the next step up.
 *
 * The selection ring is not depth-tested and so cannot fight anything.
 * It sits just clear of the slab instead, at the unit's feet, because
 * that is where a ring on the ground belongs -- lifted to the hover
 * ring's height it draws across the unit's waist and stops reading as
 * something painted on the floor.
 *
 * Both were a bare 0.03, which cleared the slab by 0.005 -- the same
 * hair's breadth that had every overlay drawn *inside* the ground
 * before #555, just on the lucky side of it.
 */
const HOVER_RING_LIFT = OVERLAY_LIFT * 4;
const SELECTION_RING_LIFT = OVERLAY_LIFT;

/** Ring radii in tiles; the selection ring is the bolder of the two. */
const HOVER_RING = { inner: 0.42, outer: 0.47 } as const;
/**
 * Wider than the hover ring and hard against the tile edge (0.5 is the
 * edge). Drawn without a depth test, so its far arc passes in front of
 * the unit standing in it; keeping the band out at the rim leaves the
 * figures inside the hole rather than crossed by the ring.
 */
const SELECTION_RING = { inner: 0.4, outer: 0.5 } as const;

/** Radial segments; not a multiple of 8 so no edge lies on the 45° view diagonal. */
const RING_SEGMENTS = 20;

/**
 * Drawn after every tile overlay (those use 1 through 4), because a
 * ring that says *this is the unit you are commanding* must not be
 * painted over by information about the tile it stands on.
 */
const RING_RENDER_ORDER = 5;

/**
 * Yaw per facing. Models face −z (north, ADR 0004 §3) at rest; rotating
 * about +y by these angles turns that front to each direction.
 */
export const FACING_YAW: Readonly<Record<Direction, number>> = {
  n: 0,
  e: -Math.PI / 2,
  s: Math.PI,
  w: Math.PI / 2,
};

// ===========================================
// Types
// ===========================================

/** Which highlights a unit shows. */
export interface UnitHighlight {
  readonly hovered: boolean;
  readonly selected: boolean;
}

// ===========================================
// UnitMesh
// ===========================================

/**
 * One unit's model on the map: the loaded model (a clone whose geometry
 * and materials are shared with every other unit of the same `modelId`)
 * placed at the centre of its footprint and turned to its facing, with a
 * hover ring and a selection ring at its feet. The model's own meshes
 * are the pick targets.
 *
 * ```
 *   object (Group, at the footprint's top centre, yaw = FACING_YAW[facing])
 *   ├── model            the loaded clone, pivot at base centre, ×footprint
 *   ├── hover ring       thin, shown while hovered, radius ×footprint
 *   └── selection ring   bold, shown while selected, radius ×footprint
 * ```
 *
 * A unit with a footprint wider than one tile (#1130: the 2×2 brute)
 * has its rings grown to circle the whole block, and its model scaled
 * by whatever its art does not already cover: a one-tile model is
 * scaled up by the footprint's side, while art authored at its
 * footprint (#1134) is drawn as built.
 */
export class UnitMesh implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the units group. */
  readonly object: Group;
  readonly motion: UnitMotion | undefined;
  /** Tiles per side the unit covers; its model and rings are scaled by it. */
  readonly footprint: number;
  private readonly model: Object3D;
  private readonly hoverRing: Mesh;
  private readonly selectionRing: Mesh;
  private readonly sleep: DormantLook;
  private readonly disposables: Disposable[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param unitId - Names the group so scene dumps read well.
   * @param model - The loaded model clone; owned by this mesh from now on.
   * @param modelId - Registered unit family, for its movement and attack rig.
   * @param footprint - Tiles per side the unit covers (#1130); the rings
   *   are scaled by it, and the model by what its art does not already
   *   cover.
   * @param authoredFootprint - Tiles per side the art was built to
   *   (#1134); a model authored at its footprint is not scaled twice.
   */
  constructor(
    unitId: string,
    model: Object3D,
    modelId?: string,
    footprint: number = DEFAULT_FOOTPRINT,
    authoredFootprint: number = DEFAULT_FOOTPRINT,
  ) {
    this.object = new Group();
    this.object.name = `unit:${unitId}`;
    this.footprint = footprint;
    this.model = model;
    this.motion = modelId ? new UnitMotionRig(model, modelId) : undefined;
    this.model.name = `unit-model:${unitId}`;
    // Art authored to a one-tile box is the same art at the footprint's
    // scale; art authored to its footprint (the #1134 brute) is drawn as
    // built. Applied to the model rather than the group so the animation
    // queue's grow and fade, which scale the group, still run from 0 to 1.
    this.model.scale.multiplyScalar(footprint / authoredFootprint);
    // Taken after the footprint scale: that scale is the awake pose.
    this.sleep = new DormantLook(this.model);
    this.disposables.push(this.sleep);
    // A unit throws a shadow and takes one; its selection rings do not,
    // being flat markers on the ground (#507).
    this.model.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    this.hoverRing = this.createRing(
      HOVER_RING.inner * footprint,
      HOVER_RING.outer * footprint,
      0.6,
      HOVER_RING_LIFT,
    );
    this.hoverRing.name = "hover-ring";
    this.selectionRing = this.createRing(
      SELECTION_RING.inner * footprint,
      SELECTION_RING.outer * footprint,
      1,
      SELECTION_RING_LIFT,
      true,
    );
    this.selectionRing.name = "selection-ring";
    this.object.add(this.model, this.hoverRing, this.selectionRing);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Moves the unit to the top centre of its footprint anchored at `pos`
   * and turns it to `facing`. For a one-tile unit that is the tile's own
   * top centre; a 2×2 stands on the corner its four tiles share.
   */
  setPose(pos: TileCoord, facing: Direction): void {
    const feet = unitFeetAt(pos, this.footprint);
    this.object.position.set(feet.x, feet.y, feet.z);
    this.object.rotation.y = FACING_YAW[facing];
  }

  /**
   * Hides the whole unit, rings included, or shows it again. A unit put
   * on the board ahead of its walk waits hidden until the walk begins
   * (#1116), so nothing stands in the dark before the player is meant
   * to see it.
   */
  setHidden(hidden: boolean): void {
    this.object.visible = !hidden;
  }

  /**
   * Draws the unit asleep — curled and dim — or awake again (#1179).
   * Idempotent; the scene calls it with the unit's status each update.
   *
   * @param dormant - Whether the unit carries the `dormant` status.
   */
  setDormant(dormant: boolean): void {
    this.sleep.set(dormant);
  }

  /** Whether the unit is drawn asleep. */
  get dormant(): boolean {
    return this.sleep.dormant;
  }

  /** Shows or hides the rings. */
  setHighlight(highlight: UnitHighlight): void {
    this.hoverRing.visible = highlight.hovered;
    this.selectionRing.visible = highlight.selected;
  }

  /** The model's meshes, for raycasting. */
  pickTargets(): Object3D[] {
    const targets: Object3D[] = [];
    this.model.traverse((child) => {
      if (child instanceof Mesh) {
        targets.push(child);
      }
    });
    return targets;
  }

  /** The unit's feet in world space. */
  worldPosition(): Vec3 {
    const { x, y, z } = this.object.position;
    return { x, y, z };
  }

  /**
   * Frees the rings and detaches the group. The model's geometry and
   * materials are shared with its prototype and other clones, so they
   * are left to the loader.
   */
  dispose(): void {
    this.motion?.reset();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.object.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** A flat ring at the feet, hidden until highlighted. */
  private createRing(
    inner: number,
    outer: number,
    opacity: number,
    lift: number,
    throughGeometry = false,
  ): Mesh {
    const geometry = new RingGeometry(inner, outer, RING_SEGMENTS);
    const material = new MeshBasicMaterial({
      color: UNIT_HIGHLIGHT_COLOUR,
      // Always transparent, never `opacity < 1` (#605). A ring at full
      // opacity fell into the *opaque* pass, where `depthWrite: false`
      // means it writes no depth and every opaque thing drawn after it
      // paints straight over the top -- so the selection ring was in
      // the scene graph, visible, at the right height, and invisible on
      // screen. The hover ring escaped only by accident, its 0.6 putting
      // it in the transparent pass. This is the same shape the tile
      // overlays already use: transparent, no depth write, explicit
      // render order.
      transparent: true,
      opacity,
      depthWrite: false,
      // The selection ring reads through whatever stands in front of
      // it; the hover ring does not. Units deploy shoulder to shoulder,
      // so a depth-tested ring under a squad beside a 2.79 u mech is
      // reduced to a sliver of orange -- which is no answer to "which
      // one am I commanding?". Drawing it through geometry gives away
      // nothing, because only the player's own unit can be selected and
      // their own units are always drawn. Hover is not safe that way:
      // it lands on enemies too, and a ring through a wall would reveal
      // a bug that vision is hiding (ADR 0006).
      depthTest: !throughGeometry,
    });
    this.disposables.push(geometry, material);
    const ring = new Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = lift;
    ring.renderOrder = RING_RENDER_ORDER;
    ring.visible = false;
    return ring;
  }
}
