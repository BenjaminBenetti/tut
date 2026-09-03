import type { Object3D, Texture } from "three";
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  NormalBlending,
  Sprite,
  SpriteMaterial,
} from "three";

import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import type { UnitId } from "../../tactical/model/unit";
import type { SpriteId } from "../data/sprite-manifest";
import { SPRITE_MANIFEST } from "../data/sprite-manifest";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { SpriteSource } from "../model/sprite-source";
import { tileTopCentre } from "../view/tactical-map-view";

// ===========================================
// Types
// ===========================================

/** What the queue needs from the scene: where units and tiles are. */
export interface AnimationScene {
  /** The unit's object to move and fade, or undefined once removed. */
  unitObject(unitId: UnitId): Object3D | undefined;
  /** World centre of a tile's top, or undefined off the map. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined;
}

/** Durations in seconds; a substitute makes tests fast or the game snappier. */
export interface AnimationTiming {
  /** Per tile stepped along a move path. */
  readonly stepSeconds: number;
  /** Muzzle flash and impact together. */
  readonly attackSeconds: number;
  /** Damage floater rise. */
  readonly floaterSeconds: number;
  /** Death fade. */
  readonly deathSeconds: number;
}

/** What the queue is composed from. */
export interface TacticalAnimationQueueOptions {
  readonly scene: AnimationScene;
  readonly sprites: SpriteSource;
  readonly timing?: AnimationTiming;
  /** `true` finishes every animation the moment it starts; tests and "skip" use it. */
  readonly instant?: boolean;
}

/** One animation in flight: advances by seconds, reports when done. */
interface Animation {
  readonly name: string;
  /**
   * Advances; returns the seconds left over once finished (so the next
   * animation can use them in the same frame), or `undefined` while it
   * is still running.
   */
  advance(seconds: number): number | undefined;
  /** Jumps to the end state. */
  finish(): void;
}

// ===========================================
// Constants
// ===========================================

/** Shipped pace: brisk enough to read, slow enough to follow. */
export const DEFAULT_ANIMATION_TIMING: AnimationTiming = {
  stepSeconds: 0.12,
  attackSeconds: 0.35,
  floaterSeconds: 0.7,
  deathSeconds: 0.5,
};

/** Billboard sizes in world units. */
const FLASH_SIZE = 0.8;
const IMPACT_SIZE = 0.7;
const FLOATER_SIZE = 0.45;

/** Where VFX sit above a unit's feet. */
const VFX_LIFT = 0.6;
const FLOATER_RISE = 0.8;

/** Style-guide tones for floaters without a sprite: `ui-danger` damage, `ui-text-dim` miss. */
const DAMAGE_COLOUR = 0xe0453c;
const MISS_COLOUR = 0x8b94a6;

// ===========================================
// TacticalAnimationQueue
// ===========================================

/**
 * Replays tactical events as animations, in order, one at a time (#338):
 * a unit walks its path tile by tile, an attack flashes at the shooter
 * and bursts at the target with a damage floater, a death fades the
 * unit out. Ticked by the `SceneService` loop; `enqueue` takes a batch
 * and a callback run once every animation in it has finished, which is
 * when the host lets the scene builder apply the new state (so a dead
 * unit fades before it disappears). `instant` collapses everything to
 * its end state on the same tick, for tests and a skip button.
 *
 * ```
 *   enqueue([moved, attacked, died], onDone)
 *      │
 *      ▼ update(dt) …
 *   walk path ──► flash + impact + floater ──► fade ──► onDone()
 * ```
 *
 * Presentation only: it moves objects it is handed and never reads or
 * writes game state.
 */
export class TacticalAnimationQueue implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene; VFX billboards live under it. */
  readonly root: Group;
  private readonly scene: AnimationScene;
  private readonly sprites: SpriteSource;
  private readonly timing: AnimationTiming;
  private instant: boolean;
  private readonly pending: { event: TacticalEvent; onDone?: () => void }[] =
    [];
  private current: Animation | undefined;
  private readonly textures = new Map<SpriteId, Texture | undefined>();
  private readonly live = new Set<Sprite>();

  // ===========================================
  // Constructor
  // ===========================================

  /** @param options - Scene access, sprite source, timing and the instant switch. */
  constructor(options: TacticalAnimationQueueOptions) {
    this.scene = options.scene;
    this.sprites = options.sprites;
    this.timing = options.timing ?? DEFAULT_ANIMATION_TIMING;
    this.instant = options.instant ?? false;
    this.root = new Group();
    this.root.name = "tactical-vfx";
    for (const id of Object.keys(SPRITE_MANIFEST) as SpriteId[]) {
      void this.sprites.loadSprite(id).then((texture) => {
        this.textures.set(id, texture);
      });
    }
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Queues `events` in order; `onDone` runs after the last of them has
   * played. Events with nothing to show (turn started, objectives) pass
   * straight through, so the callback still fires in sequence.
   */
  enqueue(events: readonly TacticalEvent[], onDone?: () => void): void {
    if (events.length === 0) {
      onDone?.();
      return;
    }
    events.forEach((event, index) => {
      this.pending.push({
        event,
        onDone: index === events.length - 1 ? onDone : undefined,
      });
    });
    if (this.instant) {
      this.skip();
    }
  }

  /** True while an animation plays or events wait. */
  get busy(): boolean {
    return this.current !== undefined || this.pending.length > 0;
  }

  /** Finishes everything queued at once and runs every callback. */
  skip(): void {
    if (this.current) {
      this.current.finish();
      this.current = undefined;
    }
    while (this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) {
        break;
      }
      const animation = this.start(next.event);
      animation?.finish();
      next.onDone?.();
    }
  }

  /** Switches instant mode; turning it on flushes the queue. */
  setInstant(instant: boolean): void {
    this.instant = instant;
    if (instant) {
      this.skip();
    }
  }

  // ===========================================
  // FrameUpdatable
  // ===========================================

  /** Advances the current animation, starting the next when it finishes. */
  update(deltaSeconds: number): void {
    let remaining = deltaSeconds;
    while (remaining > 0) {
      if (!this.current) {
        const next = this.pending[0];
        if (!next) {
          return;
        }
        const animation = this.start(next.event);
        if (!animation) {
          this.pending.shift();
          next.onDone?.();
          continue;
        }
        this.current = animation;
      }
      const leftover = this.current.advance(remaining);
      if (leftover === undefined) {
        return;
      }
      this.current = undefined;
      const finished = this.pending.shift();
      finished?.onDone?.();
      remaining = leftover;
    }
  }

  // ===========================================
  // Disposable
  // ===========================================

  /** Drops queued events and every billboard. */
  dispose(): void {
    this.pending.length = 0;
    this.current = undefined;
    for (const sprite of [...this.live]) {
      this.removeSprite(sprite);
    }
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods: animations
  // ===========================================

  /** The animation for one event, or undefined when there is nothing to show. */
  private start(event: TacticalEvent): Animation | undefined {
    switch (event.type) {
      case UNIT_MOVED:
        return this.walk(
          event.payload.unitId,
          event.payload.path,
          event.payload.to,
        );
      case ATTACK_RESOLVED:
        return this.attack(
          event.payload.attackerId,
          event.payload.targetId,
          event.payload.hit,
          event.payload.damage,
        );
      case UNIT_DIED:
        return this.fade(event.payload.unitId);
      default:
        return undefined;
    }
  }

  /** Slides the unit through every tile of its path, ending exactly on the last. */
  private walk(
    unitId: UnitId,
    path: readonly TileCoord[],
    to: TileCoord,
  ): Animation | undefined {
    const object = this.scene.unitObject(unitId);
    const end = this.scene.tileWorldPosition(to) ?? tileTopCentre(to);
    if (!object) {
      return undefined;
    }
    const points = path.map(
      (tile) => this.scene.tileWorldPosition(tile) ?? tileTopCentre(tile),
    );
    if (points.length === 0 || !samePoint(points[points.length - 1]!, end)) {
      points.push(end);
    }
    const stepSeconds = this.timing.stepSeconds;
    let elapsed = 0;
    const total = stepSeconds * points.length;
    const from = {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
    };
    return {
      name: `walk:${unitId}`,
      advance: (seconds) => {
        const leftover = Math.max(0, elapsed + seconds - total);
        elapsed = Math.min(total, elapsed + seconds);
        const progress = elapsed / stepSeconds;
        const index = Math.min(points.length - 1, Math.floor(progress));
        const local = Math.min(1, progress - index);
        const start = index === 0 ? from : points[index - 1]!;
        const target = points[index]!;
        object.position.set(
          start.x + (target.x - start.x) * local,
          start.y + (target.y - start.y) * local,
          start.z + (target.z - start.z) * local,
        );
        return elapsed >= total ? leftover : undefined;
      },
      finish: () => {
        object.position.set(end.x, end.y, end.z);
      },
    };
  }

  /** Muzzle flash at the attacker, impact burst at the target, and a floater. */
  private attack(
    attackerId: UnitId,
    targetId: UnitId,
    hit: boolean,
    damage: number,
  ): Animation | undefined {
    const attacker = this.scene.unitObject(attackerId);
    const target = this.scene.unitObject(targetId);
    if (!attacker && !target) {
      return undefined;
    }
    const flash = attacker
      ? this.billboard(
          "vfx.muzzle-flash",
          attacker.position,
          FLASH_SIZE,
          0xffffff,
        )
      : undefined;
    const impact =
      target && hit
        ? this.billboard("vfx.impact", target.position, IMPACT_SIZE, 0xffffff)
        : undefined;
    const floater = target
      ? this.billboard(
          undefined,
          target.position,
          FLOATER_SIZE,
          hit ? DAMAGE_COLOUR : MISS_COLOUR,
          hit ? `-${String(damage)}` : "miss",
        )
      : undefined;
    const floaterBaseY = (target?.position.y ?? 0) + VFX_LIFT;
    const total = this.timing.attackSeconds + this.timing.floaterSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      for (const sprite of [flash, impact, floater]) {
        if (sprite) {
          this.removeSprite(sprite);
        }
      }
    };
    return {
      name: `attack:${attackerId}>${targetId}`,
      advance: (seconds) => {
        const leftover = Math.max(0, elapsed + seconds - total);
        elapsed = Math.min(total, elapsed + seconds);
        const attackPhase = Math.min(1, elapsed / this.timing.attackSeconds);
        for (const sprite of [flash, impact]) {
          if (sprite) {
            sprite.material.opacity = 1 - attackPhase;
            if (attackPhase >= 1) {
              this.removeSprite(sprite);
            }
          }
        }
        if (floater) {
          const rise = Math.min(1, elapsed / total);
          floater.position.y = floaterBaseY + FLOATER_RISE * rise;
          floater.material.opacity = 1 - rise;
        }
        if (elapsed >= total) {
          cleanup();
          return leftover;
        }
        return undefined;
      },
      finish: cleanup,
    };
  }

  /** Shrinks the unit into the ground. The builder removes it afterwards. */
  private fade(unitId: UnitId): Animation | undefined {
    const object = this.scene.unitObject(unitId);
    if (!object) {
      return undefined;
    }
    const seconds = this.timing.deathSeconds;
    let elapsed = 0;
    return {
      name: `fade:${unitId}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const remaining = 1 - elapsed / seconds;
        object.scale.set(remaining, Math.max(0.01, remaining), remaining);
        return elapsed >= seconds ? leftover : undefined;
      },
      finish: () => {
        object.scale.set(0.01, 0.01, 0.01);
      },
    };
  }

  // ===========================================
  // Private Methods: billboards
  // ===========================================

  /**
   * A sprite billboard above `at`: the manifest texture when loaded,
   * else a flat colour; `label` becomes a canvas texture when a document
   * exists (floaters), else the colour alone.
   */
  private billboard(
    id: SpriteId | undefined,
    at: { x: number; y: number; z: number },
    size: number,
    colour: number,
    label?: string,
  ): Sprite {
    const texture = id ? this.textures.get(id) : labelTexture(label);
    const blend =
      id && SPRITE_MANIFEST[id].blend === "additive"
        ? AdditiveBlending
        : NormalBlending;
    const material = new SpriteMaterial({
      map: texture ?? null,
      color: colour,
      transparent: true,
      depthWrite: false,
      blending: blend,
    });
    const sprite = new Sprite(material);
    sprite.scale.set(size, size, 1);
    sprite.position.set(at.x, at.y + VFX_LIFT, at.z);
    sprite.name = id ?? `vfx.floater:${label ?? ""}`;
    this.root.add(sprite);
    this.live.add(sprite);
    return sprite;
  }

  /** Removes and disposes a billboard; safe to call twice. */
  private removeSprite(sprite: Sprite): void {
    if (!this.live.delete(sprite)) {
      return;
    }
    sprite.removeFromParent();
    const map = sprite.material.map;
    if (map?.name.startsWith("vfx.floater")) {
      map.dispose();
    }
    sprite.material.dispose();
  }
}

// ===========================================
// Helpers
// ===========================================

/** True when two points coincide. */
function samePoint(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Renders `label` into a small canvas texture when a document exists;
 * headless tests and node get `undefined` and a flat-colour floater.
 */
function labelTexture(label: string | undefined): Texture | undefined {
  if (label === undefined || typeof document === "undefined") {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return undefined;
  }
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 64, 32);
  const texture = new CanvasTexture(canvas);
  texture.name = `vfx.floater:${label}`;
  return texture;
}
