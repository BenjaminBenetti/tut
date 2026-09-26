import type { Color, Material, Object3D, Vector3 } from "three";
import { Mesh } from "three";

import type { Disposable } from "../model/disposable";

// ===========================================
// Constants
// ===========================================

/**
 * A sleeping bug's pose (#1179, campaign arc §7.5): hunched to this
 * share of its height and spread this much wider, so a brood in its
 * egg bed reads as curled up rather than standing ready. Scaled on the
 * model, not the unit's group, so the animation queue's grow, fade and
 * stir (which scale the group) still run from 1.
 */
export const DORMANT_POSE = { height: 0.6, spread: 1.12 } as const;

/**
 * A sleeping bug's colour as a share of its awake one: its body and its
 * glowing eyes alike, so a sleeper is dim beside an awake bug of its
 * own species under the same light.
 */
export const DORMANT_SHADE = 0.45;

// ===========================================
// DormantLook
// ===========================================

/**
 * How one unit's model looks while it sleeps: curled and dim, and
 * otherwise still. There is no idle animation for a unit to stop; a
 * sleeper is simply never animated until its brood wakes.
 *
 * ```
 *   set(true)   model.scale = rest × (spread, height, spread)
 *               every material ──► a dimmed copy this look owns
 *   set(false)  model.scale = rest, the loaded materials put back,
 *               the copies freed
 * ```
 *
 * The loaded materials are shared with every other bug of the species
 * (the specimen view's precedent), so the look dims copies it owns and
 * never touches the originals.
 */
export class DormantLook implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  private readonly rest: Vector3;
  /** Each mesh's loaded material(s), while its dimmed copies are on. */
  private readonly awake = new Map<Mesh, Material | Material[]>();
  private readonly copies: Material[] = [];
  private asleep = false;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param model - The unit's model, already scaled to its footprint;
   *   that scale is the awake pose.
   */
  constructor(private readonly model: Object3D) {
    this.rest = model.scale.clone();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Whether the model is drawn asleep now. */
  get dormant(): boolean {
    return this.asleep;
  }

  /**
   * Curls and dims the model, or puts it back as loaded. Idempotent:
   * the scene calls it on every update.
   *
   * @param dormant - Whether the unit is asleep.
   */
  set(dormant: boolean): void {
    if (dormant === this.asleep) {
      return;
    }
    this.asleep = dormant;
    if (dormant) {
      this.model.scale.set(
        this.rest.x * DORMANT_POSE.spread,
        this.rest.y * DORMANT_POSE.height,
        this.rest.z * DORMANT_POSE.spread,
      );
      this.dim();
      return;
    }
    this.model.scale.copy(this.rest);
    for (const [mesh, material] of this.awake) {
      mesh.material = material;
    }
    this.awake.clear();
    this.free();
  }

  /** Frees the dimmed copies; the loaded materials belong to the loader. */
  dispose(): void {
    this.free();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Swaps every mesh's material(s) for dimmed copies, remembering the loaded ones. */
  private dim(): void {
    this.model.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      const current = node.material as Material | Material[];
      const loaded = Array.isArray(current) ? current : [current];
      const dimmed = loaded.map((material) => {
        const copy = material.clone() as Material & {
          color?: Color;
          emissive?: Color;
        };
        copy.color?.multiplyScalar(DORMANT_SHADE);
        copy.emissive?.multiplyScalar(DORMANT_SHADE);
        this.copies.push(copy);
        return copy;
      });
      this.awake.set(node as Mesh, current);
      node.material = Array.isArray(current) ? dimmed : dimmed[0]!;
    });
  }

  /** Disposes every copy this look made. */
  private free(): void {
    for (const copy of this.copies) {
      copy.dispose();
    }
    this.copies.length = 0;
  }
}
