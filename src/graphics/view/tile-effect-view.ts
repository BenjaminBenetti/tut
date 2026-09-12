import type { Object3D } from "three";
import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
} from "three";

import type { TileEffect, TileEffectId } from "../../tactical/model/tile-effect";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import { tileTop } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Tongues of flame per fire, and the footprint they spread over within the tile. */
const TONGUES = 5;
const SPREAD = 0.55;

/** A tongue's base radius and height in world units; a fire is knee-high, not a bonfire. */
const TONGUE_RADIUS = 0.16;
const TONGUE_HEIGHT = 0.55;

/** Flame colours, style-guide warm tones: an orange body over a yellow core. */
const FLAME_BODY = 0xf06a1c;
const FLAME_CORE = 0xffd23c;

/** Flicker: how fast the tongues breathe and by how much. */
const FLICKER_HZ = 6;
const FLICKER_DEPTH = 0.35;

/** A small warm light per fire, so the ground around it reads as lit. */
const LIGHT_INTENSITY = 1.6;
const LIGHT_DISTANCE = 3;

/** Deterministic phase offsets so five tongues never breathe in step. */
const PHASES = [0, 1.7, 3.1, 4.4, 5.6];

// ===========================================
// TileEffectView
// ===========================================

/** One drawn fire: its group, its tongues and the base scale each breathes around. */
interface DrawnFire {
  readonly root: Group;
  readonly tongues: readonly Mesh[];
  readonly light: PointLight;
}

/**
 * Draws the mission's tile effects (#1121): a cluster of flame cones on
 * every burning tile, flickering, with a small warm light. Placeholder
 * geometry until art lands (architecture §7), built so a sprite sheet
 * can replace the cones without changing who calls this.
 *
 * ```
 *   update(effects)  ──► one group per effect id: added, kept, or removed
 *   update(dt)       ──► every tongue breathes on its own phase
 * ```
 *
 * Observes state only: it is handed the effects the player perceives
 * and draws exactly those, so a fire on unexplored ground is not drawn
 * (ADR 0006 §2.4).
 */
export class TileEffectView implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; every fire lives under it. */
  readonly root: Group;
  private readonly fires = new Map<TileEffectId, DrawnFire>();
  private readonly geometry = new ConeGeometry(TONGUE_RADIUS, TONGUE_HEIGHT, 6);
  private readonly body = new MeshBasicMaterial({
    color: FLAME_BODY,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly core = new MeshBasicMaterial({
    color: FLAME_CORE,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private clock = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the empty group. */
  constructor() {
    this.root = new Group();
    this.root.name = "tile-effects";
    // Cones point up by default; the geometry is shared, so it is
    // lifted once so a tongue's base sits on the tile top.
    this.geometry.translate(0, TONGUE_HEIGHT / 2, 0);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Brings the drawn fires in step with `effects`: one that is gone is
   * removed, one that is new is built, the rest are left to burn.
   *
   * @param effects - The tile effects to draw, already filtered to what the player perceives.
   */
  updateEffects(effects: readonly TileEffect[]): void {
    const keep = new Set(effects.map((effect) => effect.id));
    for (const id of [...this.fires.keys()]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    for (const effect of effects) {
      if (!this.fires.has(effect.id)) {
        this.fires.set(effect.id, this.build(effect));
      }
    }
  }

  /** Ids of the effects currently drawn, for tests and the body attributes. */
  effectIds(): readonly TileEffectId[] {
    return [...this.fires.keys()];
  }

  /** Breathes every tongue and its light. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    const t = this.clock * FLICKER_HZ;
    for (const fire of this.fires.values()) {
      fire.tongues.forEach((tongue, i) => {
        const phase = PHASES[i % PHASES.length] ?? 0;
        const breath = 1 + FLICKER_DEPTH * Math.sin(t + phase) * Math.sin(t * 0.37 + phase);
        tongue.scale.set(1, breath, 1);
      });
      fire.light.intensity = LIGHT_INTENSITY * (1 + 0.2 * Math.sin(t * 0.8));
    }
  }

  /** The drawn objects, for tests. */
  objects(): readonly Object3D[] {
    return [...this.fires.values()].map((fire) => fire.root);
  }

  /** Removes every fire and frees the shared geometry and materials. */
  dispose(): void {
    for (const id of [...this.fires.keys()]) {
      this.remove(id);
    }
    this.geometry.dispose();
    this.body.dispose();
    this.core.dispose();
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Builds one fire on its tile: tongues in a ring around a taller core, and the light. */
  private build(effect: TileEffect): DrawnFire {
    const root = new Group();
    root.name = `effect:${effect.id}`;
    const top = tileTop(effect.tile.y);
    root.position.set(effect.tile.x + 0.5, top, effect.tile.z + 0.5);
    const tongues: Mesh[] = [];
    for (let i = 0; i < TONGUES; i++) {
      const central = i === 0;
      const angle = (i / (TONGUES - 1)) * Math.PI * 2;
      const tongue = new Mesh(this.geometry, central ? this.core : this.body);
      tongue.position.set(
        central ? 0 : Math.cos(angle) * SPREAD * 0.5,
        0,
        central ? 0 : Math.sin(angle) * SPREAD * 0.5,
      );
      tongue.scale.set(1, central ? 1.3 : 0.8, 1);
      tongue.renderOrder = 6;
      tongues.push(tongue);
      root.add(tongue);
    }
    const light = new PointLight(FLAME_BODY, LIGHT_INTENSITY, LIGHT_DISTANCE);
    light.position.set(0, TONGUE_HEIGHT, 0);
    root.add(light);
    this.root.add(root);
    return { root, tongues, light };
  }

  /** Removes one fire's group; the geometry and materials are shared and stay. */
  private remove(id: TileEffectId): void {
    const fire = this.fires.get(id);
    if (fire === undefined) {
      return;
    }
    fire.light.dispose();
    fire.root.removeFromParent();
    this.fires.delete(id);
  }
}
