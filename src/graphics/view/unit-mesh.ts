import type { Object3D } from "three";
import { Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";

import type { Direction } from "../../core/model/direction";
import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Disposable } from "../model/disposable";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Hover and selection ring tint: `ui-accent`, the style guide's selection colour. */
export const UNIT_HIGHLIGHT_COLOUR = 0xf08a24;

/** Rings float just above the tile top so they never z-fight the slab. */
const RING_LIFT = 0.03;

/** Ring radii in tiles; the selection ring is the bolder of the two. */
const HOVER_RING = { inner: 0.42, outer: 0.47 } as const;
const SELECTION_RING = { inner: 0.36, outer: 0.48 } as const;

/** Radial segments; not a multiple of 8 so no edge lies on the 45° view diagonal. */
const RING_SEGMENTS = 20;

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
 * placed at its tile's top centre and turned to its facing, with a hover
 * ring and a selection ring at its feet. The model's own meshes are the
 * pick targets.
 *
 * ```
 *   object (Group, at tile top centre, yaw = FACING_YAW[facing])
 *   ├── model            the loaded clone, pivot at base centre
 *   ├── hover ring       thin, shown while hovered
 *   └── selection ring   bold, shown while selected
 * ```
 */
export class UnitMesh implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the units group. */
  readonly object: Group;
  private readonly model: Object3D;
  private readonly hoverRing: Mesh;
  private readonly selectionRing: Mesh;
  private readonly disposables: Disposable[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param unitId - Names the group so scene dumps read well.
   * @param model - The loaded model clone; owned by this mesh from now on.
   */
  constructor(unitId: string, model: Object3D) {
    this.object = new Group();
    this.object.name = `unit:${unitId}`;
    this.model = model;
    this.model.name = `unit-model:${unitId}`;
    this.hoverRing = this.createRing(HOVER_RING.inner, HOVER_RING.outer, 0.6);
    this.hoverRing.name = "hover-ring";
    this.selectionRing = this.createRing(
      SELECTION_RING.inner,
      SELECTION_RING.outer,
      1,
    );
    this.selectionRing.name = "selection-ring";
    this.object.add(this.model, this.hoverRing, this.selectionRing);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Moves the unit to a tile's top centre and turns it to `facing`. */
  setPose(pos: TileCoord, facing: Direction): void {
    const centre = tileTopCentre(pos);
    this.object.position.set(centre.x, centre.y, centre.z);
    this.object.rotation.y = FACING_YAW[facing];
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
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.object.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** A flat ring at the feet, hidden until highlighted. */
  private createRing(inner: number, outer: number, opacity: number): Mesh {
    const geometry = new RingGeometry(inner, outer, RING_SEGMENTS);
    const material = new MeshBasicMaterial({
      color: UNIT_HIGHLIGHT_COLOUR,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
    });
    this.disposables.push(geometry, material);
    const ring = new Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = RING_LIFT;
    ring.visible = false;
    return ring;
  }
}
