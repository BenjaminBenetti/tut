import type { Texture } from "three";
import { Group, Sprite, SpriteMaterial } from "three";

import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { SprayPuffOptions } from "../model/spray-puff-options";

// ===========================================
// Constants
// ===========================================

/** Name a spray's root carries when the owner gives it none. */
export const SPRAY_PUFFS_NAME = "spray-puffs";

/** Draw order of a puff: after the models it drifts over. */
const PUFF_RENDER_ORDER = 8;

/** Share of the loop a puff spends fading in; it fades out over the rest. */
const FADE_IN_SHARE = 0.25;

// ===========================================
// Types
// ===========================================

/** One puff: its sprite, its own material (opacity is per material) and its phase offset. */
interface SprayPuff {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly offset: number;
}

// ===========================================
// Spray puffs
// ===========================================

/**
 * A spray of tiny puffs drifting out of a nozzle on the strategic map
 * (#1155). Add `root` under the node that turns — the dispersal's
 * `animated` nozzle — so the spray sweeps with it, and tick `update`
 * every frame. Cheap by design: a handful of sprites, one shared
 * falloff texture, no geometry.
 *
 * ```
 *   new SprayPuffs(options, falloff, name)  ──► root: Group of Sprites
 *   update(dt)                              ──► every puff moved along its loop
 *   dispose()                               ──► materials freed, root detached
 * ```
 *
 * The falloff texture is the owner's; the spray owns only its sprite
 * materials.
 */
export class SprayPuffs implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this under the nozzle; every puff lives under it. */
  readonly root = new Group();
  private readonly puffs: readonly SprayPuff[];
  private readonly options: SprayPuffOptions;
  private clock = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Builds the puffs and places them for the first frame.
   *
   * @param options - How the spray drifts.
   * @param falloff - Soft disc every puff is cut from; owned by the caller.
   * @param name - The root's name, for tests and scene inspection.
   */
  constructor(
    options: SprayPuffOptions,
    falloff: Texture,
    name: string = SPRAY_PUFFS_NAME,
  ) {
    this.options = options;
    this.root.name = name;
    const puffs: SprayPuff[] = [];
    const count = Math.max(1, Math.floor(options.puffs));
    for (let i = 0; i < count; i++) {
      const material = new SpriteMaterial({
        color: options.colour,
        alphaMap: falloff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.renderOrder = PUFF_RENDER_ORDER;
      this.root.add(sprite);
      puffs.push({ sprite, material, offset: (i / count) * options.period });
    }
    this.puffs = puffs;
    this.drift();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Moves every puff along its loop by `deltaSeconds`. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    this.drift();
  }

  /** Frees the puff materials and detaches the root; the falloff texture stays the owner's. */
  dispose(): void {
    for (const puff of this.puffs) {
      puff.material.dispose();
    }
    this.root.clear();
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Places every puff for the current clock: born at the mouth, carried forward, swelling, fading. */
  private drift(): void {
    const { period, baseScale, growth, mouth, reach, peakOpacity } =
      this.options;
    for (const puff of this.puffs) {
      const age = this.clock + puff.offset;
      const t = (age % period) / period;
      const scale = baseScale + growth * t;
      puff.sprite.position.set(0, mouth.height, mouth.forward + reach * t);
      puff.sprite.scale.set(scale, scale, 1);
      puff.material.opacity =
        peakOpacity * Math.min(1, t / FADE_IN_SHARE) * (1 - t);
    }
  }
}
