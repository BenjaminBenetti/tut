import type { Camera, Object3D, Texture } from "three";
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  NormalBlending,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
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

/** What the queue needs from the scene: where units and tiles are, and how big. */
export interface AnimationScene {
  /** The unit's object to move and fade, or undefined once removed. */
  unitObject(unitId: UnitId): Object3D | undefined;
  /** World centre of a tile's top, or undefined off the map. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined;
  /**
   * The unit's height in world units, from its registered model. Every
   * effect anchors off this: a mech is 2.79 u and an infantry figure 0.9,
   * so a fixed lift above the feet puts damage numbers inside the legs of
   * anything large (#514).
   */
  unitHeight(unitId: UnitId): number | undefined;
  /** The unit's model id, so a death burst can tell a machine from a bug. */
  unitModelId(unitId: UnitId): string | undefined;
}

/**
 * Durations in seconds; a substitute makes tests fast or the game snappier.
 * An attack is a sequence rather than one blink — flash, streak, hit, number
 * — because a single 0.35 s event with everything at once did not read as an
 * attack at all (#514).
 */
export interface AnimationTiming {
  /** Per tile stepped along a move path. */
  readonly stepSeconds: number;
  /** Muzzle flash, or the claw slash of a melee attacker. */
  readonly flashSeconds: number;
  /** Tracer flight from muzzle to target. Ranged attacks only. */
  readonly tracerSeconds: number;
  /** Impact burst once the shot lands. */
  readonly impactSeconds: number;
  /** Damage floater rise. */
  readonly floaterSeconds: number;
  /** Death fade, and the burst that plays over it. */
  readonly deathSeconds: number;
  /** Reveal of an enemy that has just been spotted (#585). */
  readonly revealSeconds: number;
}

/** What the queue is composed from. */
export interface TacticalAnimationQueueOptions {
  readonly scene: AnimationScene;
  readonly sprites: SpriteSource;
  /** Used only to turn a tracer along its flight in screen space; optional. */
  readonly camera?: Camera;
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

/**
 * Shipped pace: brisk enough to read, slow enough to follow. A whole attack
 * lands in about 0.4 s and its number is gone by 1.3 s.
 */
export const DEFAULT_ANIMATION_TIMING: AnimationTiming = {
  stepSeconds: 0.12,
  flashSeconds: 0.12,
  tracerSeconds: 0.18,
  impactSeconds: 0.15,
  floaterSeconds: 0.9,
  deathSeconds: 0.5,
  revealSeconds: 0.35,
};

/**
 * Billboard sizes in world units (1 u = 1 tile = 64 px at the default zoom).
 * Measured by compositing each sprite over a real mission frame, not chosen
 * on a grey background: style guide §12.3.
 */
const FLASH_SIZE = 0.8;
const IMPACT_SIZE = 0.7;
const SLASH_SIZE = 0.9;
const DEATH_SIZE = 1;
const TRACER_THICKNESS = 0.22;
const FLOATER_WIDTH = 1.3;

/**
 * Where an effect sits on a unit, as a fraction of that unit's height, and
 * how far above its head the damage number floats.
 *
 * ```
 *        ── text          height + 0.25   never inside the model
 *   ┌───┐
 *   │ o │── muzzle        height × 0.65
 *   │/|\│── body / impact height × 0.55
 *   │ | │
 *   └───┘── feet          0
 * ```
 */
const MUZZLE_FRACTION = 0.65;
const BODY_FRACTION = 0.55;
const TEXT_MARGIN = 0.25;

/** How far the muzzle flash sits from the attacker's centre, toward the target. */
const MUZZLE_OFFSET = 0.35;

/** How far the damage number climbs before it fades out. */
const FLOATER_RISE = 1;

/** Height for a unit whose model is not registered; keeps effects on screen. */
const FALLBACK_HEIGHT = 1;

/**
 * Attacks at or under this world distance are melee, so they get the claw
 * slash instead of a muzzle flash and a tracer. Adjacent tiles are 1 u apart
 * and diagonals 1.41, so 1.6 covers a strike from any neighbouring tile
 * without catching a shot from two tiles away.
 */
const MELEE_RANGE = 1.6;

/** Model ids under this prefix get the chitin death burst; everything else the machine one. */
const BUG_MODEL_PREFIX = "bug.";

/** Style-guide tones: `ui-danger` damage, `ui-text-dim` miss. */
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
  private readonly camera: Camera | undefined;
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
    this.camera = options.camera;
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
      case UNIT_SPOTTED:
        // Only what the player can see: a spot on the bugs' side is
        // their business and never reaches the screen (ADR 0006 §2.4).
        return event.payload.team === "tdf"
          ? this.reveal(event.payload.unitId)
          : undefined;
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

  /**
   * One attack, as a sequence the eye can follow: a flash at the shooter, a
   * tracer crossing to the target, a burst where it lands and a number above
   * the target's head. A melee attacker (adjacent) swings a claw instead of
   * firing, and nothing is anchored to a unit's feet — see `anchor`.
   *
   * ```
   *   flash ──► tracer ──────────► impact ──► number rising
   *   0        0.06              0.24       0.39            1.29 s
   * ```
   */
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
    const muzzle = this.anchor(attackerId, MUZZLE_FRACTION);
    const body = this.anchor(targetId, BODY_FRACTION);
    const melee =
      muzzle !== undefined && body !== undefined
        ? distance(muzzle, body) <= MELEE_RANGE
        : false;

    const flash = this.openingFlash(muzzle, body, melee);
    const tracer =
      melee || !muzzle || !body
        ? undefined
        : this.billboard("vfx.tracer", muzzle, TRACER_THICKNESS, 0xffffff, {
            width: TRACER_THICKNESS * 3,
            rotation: this.screenAngle(muzzle, body),
          });
    const impact =
      body && hit
        ? this.billboard("vfx.impact", body, IMPACT_SIZE, 0xffffff)
        : undefined;
    const textAnchor = this.anchor(targetId, 1, TEXT_MARGIN);
    const floater = textAnchor
      ? this.billboard(undefined, textAnchor, FLOATER_WIDTH, 0xffffff, {
          label: hit ? `-${String(damage)}` : "MISS",
          tone: hit ? DAMAGE_COLOUR : MISS_COLOUR,
          aspect: 0.42,
        })
      : undefined;
    if (impact) {
      impact.visible = false;
    }
    if (floater) {
      floater.visible = false;
    }

    const flashSeconds = this.timing.flashSeconds;
    const flightSeconds = melee ? 0 : this.timing.tracerSeconds;
    const landsAt = flashSeconds * 0.5 + flightSeconds;
    const total =
      landsAt + Math.max(this.timing.impactSeconds, this.timing.floaterSeconds);
    const floaterBaseY = textAnchor?.y ?? 0;
    let elapsed = 0;

    const cleanup = (): void => {
      for (const sprite of [flash, tracer, impact, floater]) {
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
        if (flash) {
          const phase = Math.min(1, elapsed / flashSeconds);
          flash.material.opacity = 1 - phase;
          if (phase >= 1) {
            this.removeSprite(flash);
          }
        }
        if (tracer && muzzle && body) {
          const phase = Math.min(
            1,
            Math.max(0, (elapsed - flashSeconds * 0.5) / flightSeconds),
          );
          tracer.position.set(
            muzzle.x + (body.x - muzzle.x) * phase,
            muzzle.y + (body.y - muzzle.y) * phase,
            muzzle.z + (body.z - muzzle.z) * phase,
          );
          tracer.visible = elapsed >= flashSeconds * 0.5 && phase < 1;
        }
        if (impact) {
          const phase = Math.min(
            1,
            Math.max(0, (elapsed - landsAt) / this.timing.impactSeconds),
          );
          impact.visible = elapsed >= landsAt;
          impact.material.opacity = 1 - phase;
        }
        if (floater) {
          const phase = Math.min(
            1,
            Math.max(0, (elapsed - landsAt) / this.timing.floaterSeconds),
          );
          floater.visible = elapsed >= landsAt;
          floater.position.y = floaterBaseY + FLOATER_RISE * phase;
          // Hold the number solid for the first third, then fade: a number
          // that starts fading immediately is gone before the eye finds it.
          floater.material.opacity = Math.min(1, (1 - phase) * 1.5);
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

  /** The muzzle flash of a shot, or the claw slash of a melee strike. */
  private openingFlash(
    muzzle: Vec3 | undefined,
    body: Vec3 | undefined,
    melee: boolean,
  ): Sprite | undefined {
    if (melee) {
      return body
        ? this.billboard("vfx.claw-slash", body, SLASH_SIZE, 0xffffff)
        : undefined;
    }
    if (!muzzle) {
      return undefined;
    }
    const at = body
      ? {
          x: muzzle.x + (body.x - muzzle.x) * MUZZLE_OFFSET,
          y: muzzle.y + (body.y - muzzle.y) * MUZZLE_OFFSET,
          z: muzzle.z + (body.z - muzzle.z) * MUZZLE_OFFSET,
        }
      : muzzle;
    return this.billboard("vfx.muzzle-flash", at, FLASH_SIZE, 0xffffff);
  }

  /** Shrinks the unit into the ground under a burst. The builder removes it afterwards. */
  private fade(unitId: UnitId): Animation | undefined {
    const object = this.scene.unitObject(unitId);
    if (!object) {
      return undefined;
    }
    const modelId = this.scene.unitModelId(unitId);
    const burst = this.anchor(unitId, BODY_FRACTION);
    const sprite = burst
      ? this.billboard(
          modelId?.startsWith(BUG_MODEL_PREFIX)
            ? "vfx.bug-death"
            : "vfx.tdf-death",
          burst,
          DEATH_SIZE,
          0xffffff,
        )
      : undefined;
    const seconds = this.timing.deathSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      object.scale.set(0.01, 0.01, 0.01);
      if (sprite) {
        this.removeSprite(sprite);
      }
    };
    return {
      name: `fade:${unitId}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const remaining = 1 - elapsed / seconds;
        object.scale.set(remaining, Math.max(0.01, remaining), remaining);
        if (sprite) {
          sprite.material.opacity = remaining;
        }
        if (elapsed >= seconds) {
          cleanup();
          return leftover;
        }
        return undefined;
      },
      finish: cleanup,
    };
  }

  /**
   * An enemy coming into view (#585): it swells from nothing to its full
   * size where it was found.
   *
   * Ordering is the whole difficulty. The scene draws only what the
   * player perceives, so an unspotted enemy has **no object at all** —
   * and the host plays this queue before it places anything, which is
   * why the host enqueues spots as a second batch, after placement. By
   * the time this runs the unit exists; if it somehow does not, the
   * reveal is skipped rather than faked.
   *
   * It deliberately does not walk the unit in from where it came: that
   * path crosses ground the player has not explored, and animating it
   * would draw the route out of the fog.
   */
  private reveal(unitId: UnitId): Animation | undefined {
    const object = this.scene.unitObject(unitId);
    if (!object) {
      return undefined;
    }
    const seconds = this.timing.revealSeconds;
    let elapsed = 0;
    const settle = (): void => {
      object.scale.set(1, 1, 1);
    };
    object.scale.set(0.01, 0.01, 0.01);
    return {
      name: `reveal:${unitId}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const grown = Math.max(0.01, elapsed / seconds);
        object.scale.set(grown, grown, grown);
        if (elapsed >= seconds) {
          settle();
          return leftover;
        }
        return undefined;
      },
      finish: settle,
    };
  }

  // ===========================================
  // Private Methods: anchoring
  // ===========================================

  /**
   * A point on a unit, as a fraction of its height plus an optional margin.
   * Everything an attack draws goes through here: anchoring to the feet is
   * what put damage numbers inside mech legs (#514).
   */
  private anchor(
    unitId: UnitId,
    fraction: number,
    margin = 0,
  ): Vec3 | undefined {
    const object = this.scene.unitObject(unitId);
    if (!object) {
      return undefined;
    }
    const height = this.scene.unitHeight(unitId) ?? FALLBACK_HEIGHT;
    return {
      x: object.position.x,
      y: object.position.y + height * fraction + margin,
      z: object.position.z,
    };
  }

  /**
   * Screen-space angle from `from` to `to`, for turning a tracer along its
   * flight. Without a camera (tests, headless) the tracer stays level, which
   * is wrong but harmless.
   */
  private screenAngle(from: Vec3, to: Vec3): number {
    const camera = this.camera;
    if (!camera) {
      return 0;
    }
    const a = new Vector3(from.x, from.y, from.z).project(camera);
    const b = new Vector3(to.x, to.y, to.z).project(camera);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  // ===========================================
  // Private Methods: billboards
  // ===========================================

  /**
   * A sprite at `at` in world space — the caller has already anchored it, so
   * nothing here guesses a height. `label` renders the combat-text chip;
   * `width`, `aspect` and `rotation` shape a tracer or a text plate.
   */
  private billboard(
    id: SpriteId | undefined,
    at: Vec3,
    size: number,
    colour: number,
    options: {
      readonly label?: string;
      readonly tone?: number;
      readonly width?: number;
      readonly aspect?: number;
      readonly rotation?: number;
    } = {},
  ): Sprite {
    const texture = id
      ? this.textures.get(id)
      : chipTexture(options.label, options.tone ?? colour);
    const blend =
      id && SPRITE_MANIFEST[id].blend === "additive"
        ? AdditiveBlending
        : NormalBlending;
    const material = new SpriteMaterial({
      map: texture ?? null,
      color: texture && options.label !== undefined ? 0xffffff : colour,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: blend,
    });
    if (options.rotation !== undefined) {
      material.rotation = options.rotation;
    }
    const sprite = new Sprite(material);
    sprite.scale.set(options.width ?? size, size * (options.aspect ?? 1), 1);
    sprite.position.set(at.x, at.y, at.z);
    sprite.name = id ?? `vfx.floater:${options.label ?? ""}`;
    // Effects belong on top of the unit they describe, never behind it.
    sprite.renderOrder = 10;
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

/** Straight-line distance between two world points. */
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** True when two points coincide. */
function samePoint(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Renders combat text as a chip: a dark plate with a coloured bar, in the
 * HUD's own language (style guide §5). Plain tinted text was unreadable over
 * half the surfaces in the game — white on a snow tile, red on brick — which
 * is why the plate exists rather than a colour.
 *
 * ```
 *   ┌─┬──────────┐
 *   │▌│   -12    │   bar: ui-danger for damage, ui-text-dim for a miss
 *   └─┴──────────┘
 * ```
 *
 * Headless tests and node have no document and get `undefined`, which falls
 * back to a flat-colour sprite.
 */
function chipTexture(
  label: string | undefined,
  tone: number,
): Texture | undefined {
  if (label === undefined || typeof document === "undefined") {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return undefined;
  }
  const hex = `#${tone.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = "rgba(20, 24, 33, 0.92)";
  ctx.fillRect(4, 16, 248, 96);
  ctx.strokeStyle = "#2e3646";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 16, 248, 96);
  ctx.fillStyle = hex;
  ctx.fillRect(4, 16, 18, 96);
  ctx.font = "bold 76px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 140, 66);
  const texture = new CanvasTexture(canvas);
  texture.name = `vfx.floater:${label}`;
  return texture;
}
