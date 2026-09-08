import type { Object3D } from "three";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

import type { Disposable } from "../model/disposable";

// ===========================================
// Constants
// ===========================================

/**
 * Slate rather than the selection accent. The accent already means
 * "this is the unit you are commanding"; a tether means "this unit is
 * above what you are looking at", which is a fact about the view and not
 * about status, so it must not borrow a status colour.
 */
export const TETHER_COLOUR = 0x8fa3b8;

/** Thin enough to read as scaffolding rather than as a wall. */
const TETHER_WIDTH = 0.06;

/** Faint: it is an explanation, not a thing to look at. */
const TETHER_OPACITY = 0.55;

// ===========================================
// Types
// ===========================================

/** One unit hanging above the cut, and the drawn surface under it. */
export interface Tether {
  /** The unit this belongs to, so a stale one can be retired. */
  readonly unitId: string;
  /** Tile centre in world units. */
  readonly x: number;
  readonly z: number;
  /** World height of the unit's feet. */
  readonly top: number;
  /** World height of the surface below, where the line lands. */
  readonly bottom: number;
}

// ===========================================
// ElevationTether
// ===========================================

/**
 * Drop lines from units standing above the layer cut down to whatever is
 * still drawn beneath them (#981).
 *
 * ```
 *        ▟▛  unit, at its true height
 *        │   tether
 *   ━━━━━┷━━━━━  the floor the player is looking at
 * ```
 *
 * Units are deliberately never hidden by the cut — losing an enemy
 * because the player changed a view option would be a tactics bug
 * wearing a view option's clothes — so one drawn above it hangs in the
 * air. The line says that is elevation rather than a rendering fault. It
 * changes nothing for a unit standing on drawn floor, which gets none.
 */
export class ElevationTether implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshBasicMaterial({
    color: TETHER_COLOUR,
    transparent: true,
    opacity: TETHER_OPACITY,
    depthWrite: false,
  });
  private readonly lines = new Map<string, Mesh>();

  // ===========================================
  // Construction
  // ===========================================

  /** Builds an empty group; call `show` to fill it. */
  constructor() {
    this.root.name = "elevation-tethers";
    // Scaffolding neither throws a shadow nor catches one.
    this.root.renderOrder = 2;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Draws exactly the tethers given, retiring any that are no longer
   * wanted. Called whenever the cut moves or the units do.
   *
   * @param tethers - One per unit standing above the cut.
   */
  show(tethers: readonly Tether[]): void {
    const keep = new Set(tethers.map((tether) => tether.unitId));
    for (const [unitId, line] of this.lines) {
      if (!keep.has(unitId)) {
        line.removeFromParent();
        this.lines.delete(unitId);
      }
    }
    for (const tether of tethers) {
      const height = tether.top - tether.bottom;
      if (height <= 0) {
        continue;
      }
      const line = this.lineFor(tether.unitId);
      line.scale.set(TETHER_WIDTH, height, TETHER_WIDTH);
      line.position.set(tether.x, tether.bottom + height / 2, tether.z);
    }
  }

  /** Drops every line and the shared geometry and material. */
  dispose(): void {
    this.root.clear();
    this.lines.clear();
    this.geometry.dispose();
    this.material.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** The line for a unit, created on first use. */
  private lineFor(unitId: string): Object3D & Mesh {
    const existing = this.lines.get(unitId);
    if (existing) {
      return existing;
    }
    const line = new Mesh(this.geometry, this.material);
    line.name = `tether:${unitId}`;
    line.castShadow = false;
    line.receiveShadow = false;
    this.lines.set(unitId, line);
    this.root.add(line);
    return line;
  }
}
