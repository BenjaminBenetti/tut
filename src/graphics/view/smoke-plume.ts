import type { Texture } from "three";
import { Group, Sprite, SpriteMaterial } from "three";

import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { SmokePlumeOptions } from "../model/smoke-plume-options";

// ===========================================
// Constants
// ===========================================

/** Name a plume's root carries when the owner gives it none. */
export const SMOKE_PLUME_NAME = "smoke-plume";

/** Draw order of a puff: after the ground and props, before floaters. */
const PUFF_RENDER_ORDER = 8;

/** Share of the loop a puff spends fading in; it fades out over the rest. */
const FADE_IN_SHARE = 0.25;

// ===========================================
// Types
// ===========================================

/** One puff: its sprite, its own material (opacity is per material) and its phase offset. */
interface SmokePuff {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly offset: number;
}

// ===========================================
// Smoke plume
// ===========================================

/**
 * A plume of smoke over one thing on the map (#1130, #1132): a burnt-out
 * radar, a burning tile. A few soft puffs on one loop, each on its own
 * phase, so the plume is always mid-breath. Add `root` where the smoke
 * should rise from and tick `update` every frame.
 *
 * ```
 *   new SmokePlume(options, falloff, name)  ──► root: Group of Sprites
 *   update(dt)                               ──► every puff moved along its loop
 *   dispose()                                ──► materials freed, root detached
 * ```
 *
 * The falloff texture is the owner's and is shared by every plume it
 * makes; the plume owns its sprite materials and nothing else.
 */
export class SmokePlume implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this where the smoke rises from; every puff lives under it. */
  readonly root = new Group();
  private readonly puffs: readonly SmokePuff[];
  private readonly options: SmokePlumeOptions;
  private clock = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Builds the puffs and places them for the first frame.
   *
   * @param options - How the plume breathes.
   * @param falloff - Soft disc every puff is cut from; owned by the caller.
   * @param name - The root's name, for tests and scene inspection.
   */
  constructor(
    options: SmokePlumeOptions,
    falloff: Texture,
    name: string = SMOKE_PLUME_NAME,
  ) {
    this.options = options;
    this.root.name = name;
    const puffs: SmokePuff[] = [];
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
    this.breathe();
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Moves every puff along its loop by `deltaSeconds`. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    this.breathe();
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

  /** Places every puff for the current clock: born low and small, rising, swelling, fading. */
  private breathe(): void {
    const { period, baseScale, growth, startHeight, rise, drift, peakOpacity } =
      this.options;
    for (const puff of this.puffs) {
      const age = this.clock + puff.offset;
      const t = (age % period) / period;
      const scale = baseScale + growth * t;
      puff.sprite.position.set(
        Math.sin(age * 1.3) * drift * t,
        startHeight + rise * t,
        Math.cos(age * 0.9) * drift * t,
      );
      puff.sprite.scale.set(scale, scale, 1);
      puff.material.opacity =
        peakOpacity * Math.min(1, t / FADE_IN_SHARE) * (1 - t);
    }
  }
}
