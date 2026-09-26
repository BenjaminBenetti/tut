import { jumpArcPoint } from "../../tactical/service/jump-trajectory-service";
import { CIVILIANS_KILLED } from "../../tactical/model/civilians-killed-event";
import { MECH_SYSTEM_USED } from "../../tactical/model/mech-system-used-event";
import type { UnitMotion } from "../model/unit-motion";
import type { Camera, DataTexture, Object3D, Texture } from "three";
import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

import type { Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TacticalEvent } from "../../tactical/model/tactical-event";
import { ATTACK_RESOLVED } from "../../tactical/model/attack-resolved-event";
import { BLAST_RESOLVED } from "../../tactical/model/blast-resolved-event";
import { BROOD_WOKE } from "../../tactical/model/brood-woke-event";
import type { EffectDamagedPayload } from "../../tactical/model/effect-damaged-event";
import { EFFECT_DAMAGED } from "../../tactical/model/effect-damaged-event";
import type { StructureDestroyedPayload } from "../../tactical/model/structure-destroyed-event";
import { STRUCTURE_DESTROYED } from "../../tactical/model/structure-destroyed-event";
import { TURRET_DESTROYED } from "../../tactical/model/turret-destroyed-event";
import {
  SPAWNER_DAMAGED,
  type SpawnerDamagedPayload,
} from "../../tactical/model/spawner-damaged-event";
import type { SpawnerId } from "../../tactical/model/tactical-state";
import { UNIT_DIED } from "../../tactical/model/unit-died-event";
import type { UnitsHealedPayload } from "../../tactical/model/unit-healed-event";
import { UNITS_HEALED } from "../../tactical/model/unit-healed-event";
import { UNIT_MOVED } from "../../tactical/model/unit-moved-event";
import { UNIT_SPOTTED } from "../../tactical/model/unit-spotted-event";
import type { UnitId } from "../../tactical/model/unit";
import type { SpriteId } from "../data/sprite-manifest";
import type { SpriteAssetEntry, SpriteSheet } from "../data/sprite-manifest";
import { SPRITE_MANIFEST } from "../data/sprite-manifest";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { SpriteSource } from "../model/sprite-source";
import { tileTopCentre } from "../view/tactical-map-view";
import { isMeleeRange } from "../../tactical/model/weapon-profile";
import { createBlastRingTexture } from "./blast-ring-texture";
import { createFalloffTexture } from "./falloff-texture";

// ===========================================
// Types
// ===========================================

/** What the queue needs from the scene: where units and tiles are, and how big. */
export interface AnimationScene {
  /** The unit's object to move and fade, or undefined once removed. */
  unitObject(unitId: UnitId): Object3D | undefined;
  /** Local limb poses; scenes with stand-in geometry may omit this. */
  unitMotion?(unitId: UnitId): UnitMotion | undefined;
  /** World centre of a tile's top, or undefined off the map. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined;
  /**
   * Where the unit's feet are when it stands on `tile` (#1130): the
   * tile's top at the centre of the unit's footprint, so a 2×2 brute
   * walks along the corners its four tiles share rather than along the
   * centres of its anchor tiles. Scenes without footprints may omit it;
   * the queue then walks through tile centres, as it always did.
   */
  unitWorldPositionAt?(unitId: UnitId, tile: TileCoord): Vec3 | undefined;
  /**
   * The unit's height in world units, from its registered model. Every
   * effect anchors off this: a mech is 2.79 u and an infantry figure 0.9,
   * so a fixed lift above the feet puts damage numbers inside the legs of
   * anything large (#514).
   */
  unitHeight(unitId: UnitId): number | undefined;
  /** The unit's model id, so a death burst can tell a machine from a bug. */
  unitModelId(unitId: UnitId): string | undefined;
  /** An egg spawner's base in world space, or undefined while it loads. */
  spawnerWorldPosition(spawnerId: SpawnerId): Vec3 | undefined;
  /** The spawner's height, so its burst anchors like every other effect. */
  spawnerHeight(spawnerId: SpawnerId): number | undefined;
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
/** A sprite stepping through a frame sheet, and how far in it is. */
interface SheetPlayback {
  readonly sheet: SpriteSheet;
  readonly texture: Texture;
  elapsedMs: number;
}

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

/**
 * One part of a composite animation: what to play and when, from the
 * composite's own start. Built lazily so its sprites appear at `at`,
 * not when the composite is assembled.
 */
interface ScheduledPart {
  readonly at: number;
  readonly start: () => Animation | undefined;
}

/** What one turn of the queue plays: the animation and how many pending events it covers. */
interface Playback {
  readonly animation: Animation | undefined;
  readonly count: number;
}

// ===========================================
// Constants
// ===========================================

/**
 * Shipped pace: brisk enough to read, slow enough to follow. A whole attack
 * lands in about 0.4 s and its number is gone by 1.3 s.
 */
export const DEFAULT_ANIMATION_TIMING: AnimationTiming = {
  stepSeconds: 0.24,
  flashSeconds: 0.12,
  tracerSeconds: 0.18,
  impactSeconds: 0.15,
  floaterSeconds: 0.9,
  deathSeconds: 0.5,
  revealSeconds: 0.35,
};

/** Text size on a chip drawn to fit its words, in canvas pixels of a 128 px chip. */
const CHIP_FIT_FONT_PX = 64;
/** Canvas pixels the tone bar and the chip's frame take from the text's room. */
const CHIP_TEXT_INSET = 18 + 8;
/** Canvas pixels of air either side of the words. */
const CHIP_TEXT_MARGIN = 24;

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

/**
 * Height of a notice in world units: the same band as the damage
 * number (`FLOATER_WIDTH * 0.42`), so the two read as one family of
 * chips above the unit. The width follows the words — the chip is
 * drawn to fit its text and the sprite takes the chip's aspect — so a
 * short refusal is a short chip.
 *
 * It was nine tiles wide at a fixed aspect: a refusal spanned half the
 * screen at the default zoom and grew with it, which is what the
 * Executive Director saw as chips "wayyy too big" that scaled with the
 * view. World units are right — the chip belongs to the scene and
 * should zoom with the unit it sits over — but the size has to be a
 * unit's size, not a map's.
 */
const NOTICE_HEIGHT = 0.5;
/**
 * `--ui-warn`, and chosen rather than landed on (#1030).
 *
 * Not `--ui-accent` `0xf08a24`: that is `UNIT_HIGHLIGHT_COLOUR`, and it
 * already means "the unit you are commanding" — a bar in that colour
 * above that same unit would be read as part of the selection. Not
 * `--ui-danger` `0xe0453c`, which the damage floater uses and so means
 * harm taken. A refusal is neither; it is a warning that the thing asked
 * for cannot happen, which is exactly what the warn token is for.
 */
const NOTICE_COLOUR = 0xf0c63c;

/** A notice lasts this many floater-durations, and holds full opacity for this share of it. */
const NOTICE_DWELL = 2.5;
const NOTICE_HOLD = 0.6;

/** Height for a unit whose model is not registered; keeps effects on screen. */
const FALLBACK_HEIGHT = 1;

/**
 * A woken brood's stir (#1179): how many reveals long it lasts, how
 * many times each bug heaves up, and how far (a share of its height).
 */
const STIR_REVEALS = 2;
const STIR_HEAVES = 2;
const STIR_RISE = 0.25;

/** Egg burst size in tiles, and how far it swells as it fades (#697). */
const BURST_SIZE = 1.6;
const BURST_GROWTH = 0.6;

/** Model ids under this prefix get the chitin death burst; everything else the machine one. */
const BUG_MODEL_PREFIX = "bug.";

/** Style-guide tones: `ui-danger` damage, `ui-text-dim` miss. */
const DAMAGE_COLOUR = 0xe0453c;
const MISS_COLOUR = 0x8b94a6;

/** Fire damage reads in the flame's own orange, so a burn is told from a hit. */
const BURN_COLOUR = 0xf08a24;

/** A heal reads in `--ui-ok` green (#1138): the damage floater's shape, the opposite sign and tone. */
const HEAL_COLOUR = 0x7ccb5a;

/** A blast burst covers its radius: one tile of sprite per tile of reach, plus the impact. */
const BLAST_BASE_SIZE = 1.4;
const BLAST_SIZE_PER_TILE = 1.6;
const BLAST_GROWTH = 0.5;

/**
 * The explosion's three layers (#1130), each as a share of the blast's
 * size: the spark core the impact sprite already draws, a fireball
 * glow that swells and dies, and a shockwave ring that runs out past
 * the footprint's edge.
 *
 * ```
 *   core   ●        0.7 → 1.05 of size, gone with the flash
 *   glow   ◉◉       0.5 → 1.2         fades as the square of time
 *   ring   ◯ → ◯    0.3 → 1.7         the wave leaving the impact
 * ```
 */
const BLAST_CORE_SHARE = 0.7;
const BLAST_GLOW_START = 0.5;
const BLAST_GLOW_END = 1.2;
const BLAST_RING_START = 0.3;
const BLAST_RING_END = 1.7;

/** Fireball in the flame's orange; the wave in a pale, hot yellow. */
const BLAST_GLOW_COLOUR = 0xf08a24;
const BLAST_RING_COLOUR = 0xfff0c0;

/** Where the shell bursts above a tile it was aimed at, in world units. */
const BLAST_LIFT = 0.3;

/** A falling structure's puff, and how far a blast's number rises above the tile. */
const RUBBLE_SIZE = 1.1;
const TILE_TEXT_LIFT = 0.6;

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
 * One exception to "one at a time" (#1130): a blast is one event to
 * the eye however many the rules emit for it. An `AttackResolved`, the
 * deaths it and its blast caused and the `BlastResolved` itself land
 * together, as one explosion, with every number, fade and falling
 * structure in the footprint starting at the same instant — see
 * `blastGroupLength` and `volley`.
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
  private notices: Animation[] = [];
  private readonly pending: {
    event: TacticalEvent;
    onDone?: () => void;
    /** Told when this event begins to play. */
    onStart?: (event: TacticalEvent) => void;
  }[] = [];
  private current: Animation | undefined;
  /** How many pending events `current` covers: one, or a whole blast (#1130). */
  private currentCount = 0;
  /** Keeps alternating feet across the simulation's one-tile move events. */
  private readonly walkedTiles = new Map<UnitId, number>();
  private readonly textures = new Map<SpriteId, Texture | undefined>();
  private readonly live = new Set<Sprite>();
  /** Sprites playing a frame sheet, with their own cloned texture (#697). */
  private readonly playing = new Map<Sprite, SheetPlayback>();
  /** Procedural explosion textures, built on first use and owned here (#1130). */
  private glowTexture: DataTexture | undefined;
  private ringTexture: DataTexture | undefined;

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
  enqueue(
    events: readonly TacticalEvent[],
    onDone?: () => void,
    onStart?: (event: TacticalEvent) => void,
  ): void {
    if (events.length === 0) {
      onDone?.();
      return;
    }
    events.forEach((event, index) => {
      this.pending.push({
        event,
        onDone: index === events.length - 1 ? onDone : undefined,
        onStart,
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
      this.settle(this.currentCount);
    }
    while (this.pending.length > 0) {
      const { animation, count } = this.begin();
      animation?.finish();
      this.settle(count);
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
  /**
   * Raises a line of words above a unit, now, without queueing behind
   * whatever is playing.
   *
   * The same floater the damage numbers use — #1029 asked whether they
   * were the same mechanism and the answer is yes; a refusal and a
   * completed action are both "this happened, here". A notice is
   * deliberately *not* part of `pending`: a refusal has to appear while
   * the player is still looking at the action they attempted, not after
   * the current attack finishes playing, and several can stand at once
   * when units act in succession.
   *
   * @param unitId - The unit to speak above.
   * @param text - The words, already in the player's language.
   * @param tone - Colour; the refusal tone by default.
   */
  notice(unitId: UnitId, text: string, tone = NOTICE_COLOUR): void {
    const anchor = this.anchor(unitId, 1, TEXT_MARGIN);
    if (!anchor) {
      return;
    }
    const sprite = this.billboard(undefined, anchor, NOTICE_HEIGHT, 0xffffff, {
      label: text,
      tone,
      fitLabel: true,
    });
    if (!sprite) {
      return;
    }
    // One at a time per unit. Two refusals stacked at the same anchor
    // overlapped into an unreadable smudge in the first capture, and the
    // older reason is the less useful one anyway.
    const name = `notice:${unitId}`;
    for (const standing of this.notices.filter((n) => n.name === name)) {
      standing.finish();
    }
    this.notices = this.notices.filter((n) => n.name !== name);
    const baseY = anchor.y;
    const total = this.timing.floaterSeconds * NOTICE_DWELL;
    let elapsed = 0;
    this.notices.push({
      name: `notice:${unitId}`,
      advance: (seconds) => {
        elapsed = Math.min(total, elapsed + seconds);
        const phase = elapsed / total;
        sprite.position.y = baseY + FLOATER_RISE * phase;
        // Holds, then fades: a refusal the player has to read is worth
        // more time on screen than a damage number they glance at.
        sprite.material.opacity =
          phase < NOTICE_HOLD
            ? 1
            : 1 - (phase - NOTICE_HOLD) / (1 - NOTICE_HOLD);
        if (elapsed >= total) {
          this.removeSprite(sprite);
          return 0;
        }
        return undefined;
      },
      finish: () => {
        this.removeSprite(sprite);
      },
    });
  }

  /**
   * Advances the queue and any standing notices by `deltaSeconds`.
   *
   * @param deltaSeconds - Seconds since the last frame.
   */
  update(deltaSeconds: number): void {
    this.stepSheets(deltaSeconds);
    // Notices run beside the queue rather than in it, so a refusal is
    // not held back by an animation the player is not waiting on.
    this.notices = this.notices.filter(
      (notice) => notice.advance(deltaSeconds) === undefined,
    );
    let remaining = deltaSeconds;
    while (remaining > 0) {
      if (!this.current) {
        if (this.pending.length === 0) {
          return;
        }
        const { animation, count } = this.begin();
        if (!animation) {
          this.settle(count);
          continue;
        }
        this.current = animation;
        this.currentCount = count;
      }
      const leftover = this.current.advance(remaining);
      if (leftover === undefined) {
        return;
      }
      this.current = undefined;
      this.settle(this.currentCount);
      remaining = leftover;
    }
  }

  // ===========================================
  // Private Methods: the queue
  // ===========================================

  /**
   * Starts whatever is at the head of the queue: one event, or the
   * events of one blast played as one explosion (#1130). Every event
   * covered is told it has begun, in order, before the first frame.
   *
   * Told as it begins, not as it ends: what the HUD writes about an
   * event should appear as the event happens on the map, so a bug
   * phase reads one action at a time rather than all at once.
   *
   * @returns The animation, or none when there is nothing to show, and
   *   how many pending events it covers.
   */
  private begin(): Playback {
    const count = this.blastGroupLength();
    const group = this.pending.slice(0, count);
    for (const entry of group) {
      entry.onStart?.(entry.event);
    }
    const head = group[0];
    if (!head) {
      return { animation: undefined, count: 0 };
    }
    const animation =
      count > 1
        ? this.volley(group.map((entry) => entry.event))
        : this.start(head.event);
    return { animation, count };
  }

  /**
   * Retires the first `count` pending events, running each one's
   * callback in order.
   *
   * @param count - Events the animation that just finished covered.
   */
  private settle(count: number): void {
    for (const finished of this.pending.splice(0, count)) {
      finished.onDone?.();
    }
  }

  /**
   * How many events from the head of the queue are one blast (#1130).
   *
   * The rules emit a blast as a run of events: the shot at what it was
   * aimed at, then whatever died to the shot and to the blast, then the
   * `BlastResolved` naming everyone it reached, then the structures it
   * brought down. Played one after another they read as the target
   * being hit, then a corpse, then a burst, then the neighbours — a
   * blast is none of those things, it is one moment.
   *
   * ```
   *   [AttackResolved]? [UnitDied | SpawnerDamaged]* BlastResolved [StructureDestroyed]*
   *    same attacker     each in the blast's victims   the one       same shooter
   *                      or the aimed target           shot
   * ```
   *
   * Anything that breaks the shape — a different attacker, a death the
   * blast did not cause, no blast at all — ends the group at one event,
   * and the head plays as it always did.
   *
   * @returns The run's length; `1` for any event that is not a blast's.
   */
  private blastGroupLength(): number {
    const head = this.pending[0]?.event;
    if (head === undefined) {
      return 0;
    }
    let attacker: UnitId | undefined;
    const inBlast = new Set<string>();
    let next = 0;
    if (head.type === ATTACK_RESOLVED) {
      attacker = head.payload.attackerId;
      inBlast.add(head.payload.targetId);
      next = 1;
    }
    const struck: string[] = [];
    for (; next < this.pending.length; next++) {
      const event = this.pending[next]?.event;
      if (event?.type === UNIT_DIED) {
        struck.push(event.payload.unitId);
      } else if (event?.type === TURRET_DESTROYED) {
        struck.push(event.payload.turretId);
      } else if (event?.type === CIVILIANS_KILLED) {
        struck.push(event.payload.unitId);
      } else if (event?.type === SPAWNER_DAMAGED) {
        struck.push(event.payload.spawnerId);
      } else {
        break;
      }
    }
    const blast = this.pending[next]?.event;
    if (blast?.type !== BLAST_RESOLVED) {
      return 1;
    }
    if (attacker !== undefined && blast.payload.attackerId !== attacker) {
      return 1;
    }
    for (const victim of blast.payload.victims) {
      inBlast.add(victim.targetId);
    }
    if (!struck.every((id) => inBlast.has(id))) {
      return 1;
    }
    next++;
    for (; next < this.pending.length; next++) {
      const event = this.pending[next]?.event;
      if (
        event?.type !== STRUCTURE_DESTROYED ||
        event.payload.unitId !== blast.payload.attackerId
      ) {
        break;
      }
    }
    return next;
  }

  // ===========================================
  // Disposable
  // ===========================================

  /** Drops queued events and every billboard. */
  dispose(): void {
    this.pending.length = 0;
    this.current?.finish();
    this.current = undefined;
    this.currentCount = 0;
    this.walkedTiles.clear();
    for (const sprite of [...this.live]) {
      this.removeSprite(sprite);
    }
    this.glowTexture?.dispose();
    this.glowTexture = undefined;
    this.ringTexture?.dispose();
    this.ringTexture = undefined;
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods: animations
  // ===========================================

  /** The animation for one event, or undefined when there is nothing to show. */
  private start(event: TacticalEvent): Animation | undefined {
    switch (event.type) {
      case MECH_SYSTEM_USED:
        return event.payload.action === "brace"
          ? this.deployBrace(event.payload.unitId)
          : undefined;
      case UNIT_MOVED:
        return this.walk(
          event.payload.unitId,
          event.payload.path,
          event.payload.to,
          event.payload.jump ?? false,
          event.payload.jumpApex,
        );
      case ATTACK_RESOLVED:
        return this.attack(
          event.payload.attackerId,
          event.payload.targetId,
          event.payload.hit,
          event.payload.damage,
          event.payload.weaponRange,
        );
      case UNIT_DIED:
        return this.fade(event.payload.unitId);
      case TURRET_DESTROYED:
        // A turret leaves as a unit does (#1155): the scene has already
        // taken its mesh, so the fade is what the eye gets.
        return this.fade(event.payload.turretId);
      case CIVILIANS_KILLED:
        // A civilian group dies as a squad does (campaign arc §6.4).
        return this.fade(event.payload.unitId);
      case SPAWNER_DAMAGED:
        return this.spawnerBurst(event.payload);
      case BLAST_RESOLVED:
        // On its own: a shot at the ground that reached nothing that
        // died. With company it arrives through `begin` instead.
        return this.volley([event]);
      case STRUCTURE_DESTROYED:
        return this.rubble(event.payload);
      case EFFECT_DAMAGED:
        return this.burn(event.payload);
      case UNITS_HEALED:
        return this.heal(event.payload);
      case UNIT_SPOTTED:
        // Only what the player can see: a spot on the bugs' side is
        // their business and never reaches the screen (ADR 0006 §2.4).
        return event.payload.team === "tdf"
          ? this.reveal(event.payload.unitId)
          : undefined;
      case BROOD_WOKE:
        return this.stir(event.payload.unitIds);
      default:
        return undefined;
    }
  }

  /** Extends stabilisers before returning control, retaining the planted pose. */
  private deployBrace(unitId: UnitId): Animation | undefined {
    const motion = this.scene.unitMotion?.(unitId);
    if (!motion?.brace) return undefined;
    let elapsed = 0;
    const duration = Math.max(0.35, this.timing.stepSeconds * 2);
    const from = motion.braceAmount ?? 0;
    return {
      name: `brace:${unitId}`,
      advance: (seconds) => {
        elapsed += seconds;
        const progress = Math.min(1, elapsed / duration);
        const smooth = progress * progress * (3 - 2 * progress);
        motion.brace?.(from + (1 - from) * smooth);
        return elapsed >= duration ? elapsed - duration : undefined;
      },
      finish: () => motion.brace?.(1),
    };
  }

  /** Walks with a limb stride or follows one continuous jump arc through the validated corridor. */
  private walk(
    unitId: UnitId,
    path: readonly TileCoord[],
    to: TileCoord,
    jump = false,
    jumpApex?: number,
  ): Animation | undefined {
    const object = this.scene.unitObject(unitId);
    // Where this unit's feet go on a tile: its footprint's centre when
    // the scene knows footprints (#1130), else the tile's own centre.
    const standAt = (tile: TileCoord): Vec3 =>
      this.scene.unitWorldPositionAt?.(unitId, tile) ??
      this.scene.tileWorldPosition(tile) ??
      tileTopCentre(tile);
    const end = standAt(to);
    if (!object) {
      return undefined;
    }
    // An arrival waits hidden where its walk begins; the walk shows it (#1116).
    object.visible = true;
    const points = path.map(standAt);
    if (points.length === 0 || !samePoint(points[points.length - 1]!, end)) {
      points.push(end);
    }
    const motion = this.scene.unitMotion?.(unitId);
    const walkedBefore = this.walkedTiles.get(unitId) ?? 0;
    const stepSeconds = jump
      ? Math.max(
          0.9,
          Math.hypot(end.x - object.position.x, end.z - object.position.z) *
            0.09,
        )
      : this.timing.stepSeconds;
    let elapsed = 0;
    const deployed = motion?.braceAmount ?? 0;
    const retractSeconds =
      deployed > 0 ? Math.max(0.35, this.timing.stepSeconds * 2) : 0;
    const total = retractSeconds + stepSeconds * points.length;
    const from = {
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
    };
    const finish = (): void => {
      const previous = points.length > 1 ? points[points.length - 2]! : from;
      faceTowards(object, previous, end);
      object.position.set(end.x, end.y, end.z);
      this.walkedTiles.set(unitId, walkedBefore + points.length);
      motion?.brace?.(0);
      motion?.reset();
    };
    return {
      name: `walk:${unitId}`,
      advance: (seconds) => {
        const leftover = Math.max(0, elapsed + seconds - total);
        elapsed = Math.min(total, elapsed + seconds);
        if (elapsed < retractSeconds) {
          const progress = elapsed / retractSeconds;
          motion?.brace?.(
            deployed * (1 - progress * progress * (3 - 2 * progress)),
          );
          return undefined;
        }
        if (deployed > 0) motion?.brace?.(0);
        const progress = (elapsed - retractSeconds) / stepSeconds;
        const index = Math.min(points.length - 1, Math.floor(progress));
        const local = Math.min(1, progress - index);
        const start = index === 0 ? from : points[index - 1]!;
        const target = points[index]!;
        faceTowards(object, start, target);
        if (!jump) motion?.walk(walkedBefore + progress);
        if (jump) {
          const apex =
            jumpApex === undefined
              ? Math.max(start.y, target.y) + 1.6
              : standAt({ ...to, y: jumpApex }).y;
          const point = jumpArcPoint(start, target, apex, local);
          object.position.set(point.x, point.y, point.z);
        } else {
          object.position.set(
            start.x + (target.x - start.x) * local,
            start.y + (target.y - start.y) * local,
            start.z + (target.z - start.z) * local,
          );
        }
        if (elapsed >= total) {
          finish();
          return leftover;
        }
        return undefined;
      },
      finish,
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
    weaponRange: number,
  ): Animation | undefined {
    const attacker = this.scene.unitObject(attackerId);
    const target = this.scene.unitObject(targetId);
    if (!attacker && !target) {
      return undefined;
    }
    const motion = this.scene.unitMotion?.(attackerId);
    const originalYaw = attacker?.rotation.y;
    if (attacker && target)
      faceTowards(attacker, attacker.position, target.position);
    const muzzle = this.anchor(attackerId, MUZZLE_FRACTION);
    const body = this.anchor(targetId, BODY_FRACTION);
    // The weapon, not the gap between the models (#457). Measuring the
    // gap answers "are they close", and that is a different question:
    // a rifle squad firing at the tile next door is close and is not
    // melee, and a swarmer biting a mech on a roof is a storey and a
    // half away and is.
    const melee = isMeleeRange(weaponRange);

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
      motion?.reset();
      if (attacker && originalYaw !== undefined)
        attacker.rotation.y = originalYaw;
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
        motion?.attack(
          Math.min(
            1,
            elapsed /
              (flashSeconds + flightSeconds + this.timing.impactSeconds),
          ),
          melee,
        );
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
   * A unit that walked into view is the host's business, not this
   * method's: `placeArrivals` puts it on the board where its walk began
   * and its spot is phased ahead of its first move, so the swell plays
   * there and the walk follows in full (#1116, Executive Director). A
   * unit spotted standing still simply swells where it stands.
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
    // An arrival waits hidden where its walk begins; its spot shows it (#1116).
    object.visible = true;
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

  /**
   * A brood waking (#1179): every member the player can see heaves up
   * and settles, together, twice. Played after the redraw
   * (`phaseEvents`), so the scene has already uncurled them and a
   * member spotted by the same step has been placed; one the player
   * cannot see has no object and does nothing, so the stir gives away
   * no bug that vision hides (ADR 0006).
   *
   * ```
   *   y scale  1 ─╱╲─╱╲─ 1      heaves: STIR_HEAVES, each smaller
   *   x, z     1 ─╲╱─╲╱─ 1      pulled in by a third of the rise
   * ```
   *
   * @param unitIds - The brood's members.
   * @returns The stir, or undefined when none of them is drawn.
   */
  private stir(unitIds: readonly UnitId[]): Animation | undefined {
    const objects = unitIds
      .map((unitId) => this.scene.unitObject(unitId))
      .filter((object): object is Object3D => object !== undefined);
    if (objects.length === 0) {
      return undefined;
    }
    const seconds = this.timing.revealSeconds * STIR_REVEALS;
    let elapsed = 0;
    const pose = (lift: number): void => {
      for (const object of objects) {
        object.scale.set(1 - lift / 3, 1 + lift, 1 - lift / 3);
      }
    };
    return {
      name: `stir:${String(objects.length)}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const t = elapsed / seconds;
        pose(
          STIR_RISE *
            Math.abs(Math.sin(Math.PI * STIR_HEAVES * t)) *
            (1 - t / 2),
        );
        if (elapsed >= seconds) {
          pose(0);
          return leftover;
        }
        return undefined;
      },
      finish: () => {
        pose(0);
      },
    };
  }

  /**
   * The egg burst, when charges finish a spawner off (#697).
   *
   * Destroying spawners *is* the clearance mission -- `0 / 2 Destroy
   * spawner` is the objective panel -- and until now the moment the
   * whole mission is about resolved with nothing on screen at all,
   * while `vfx.egg-burst` sat in the manifest, preloaded and never
   * drawn. A hit that does not finish it plays nothing extra: the
   * attack sequence has already shown the strike.
   *
   * @param payload - The damage event; only the killing blow bursts.
   * @returns The burst, or undefined when the spawner survives.
   */
  private spawnerBurst(payload: SpawnerDamagedPayload): Animation | undefined {
    if (!payload.destroyed) {
      return undefined;
    }
    const base = this.scene.spawnerWorldPosition(payload.spawnerId);
    if (!base) {
      return undefined;
    }
    // Anchored off the spawner's own height, like every other effect
    // since #514 -- a fixed lift put bursts inside anything tall.
    const height =
      this.scene.spawnerHeight(payload.spawnerId) ?? FALLBACK_HEIGHT;
    const at = { x: base.x, y: base.y + height * BODY_FRACTION, z: base.z };
    const sprite = this.billboard("vfx.egg-burst", at, BURST_SIZE, 0xffffff);
    const seconds = this.timing.deathSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      this.removeSprite(sprite);
    };
    return {
      name: `egg-burst:${payload.spawnerId}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const progress = elapsed / seconds;
        // Swells as it fades, so it reads as a burst rather than a
        // sprite quietly being turned down.
        const scale = BURST_SIZE * (1 + progress * BURST_GROWTH);
        sprite.scale.set(scale, scale, 1);
        sprite.material.opacity = 1 - progress;
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
   * A blast as one explosion (#1130): the shot leaves the shooter, and
   * at the instant it lands everything it did happens at once — the
   * explosion over the impact, sized to the radius; the number over the
   * aimed target and over every victim the blast reached; the fade of
   * everything it killed; the burst of every spawner it finished; the
   * puff over every structure it brought down. A shot at the ground
   * that went wide plays the shot and MISS over the tile, nothing else.
   *
   * ```
   *   flash ──► tracer ──────────► ● explosion  ─┐
   *   0        0.06              0.24            ├─ numbers, fades,
   *                                              │  bursts and rubble
   *                                              └─ all from 0.24 s
   * ```
   *
   * Until this the rules' run of events for one shell — the hit, then
   * each death, then the burst, then the neighbours' numbers — played
   * in that order, one after the other, so a rocket into a clump read
   * as the bugs being picked off in turn (Executive Director,
   * 2026-09-13). The events are still told to the HUD in order, at the
   * start; only the picture is one moment.
   *
   * @param events - The blast's run, as `blastGroupLength` cut it: an
   *   optional `AttackResolved`, deaths, the `BlastResolved`, rubble.
   */
  private volley(events: readonly TacticalEvent[]): Animation | undefined {
    const blast = events.find((event) => event.type === BLAST_RESOLVED);
    if (blast === undefined) {
      return undefined;
    }
    const aimed = events.find((event) => event.type === ATTACK_RESOLVED);
    const impact = blast.payload;
    const ground =
      this.scene.tileWorldPosition(impact.impact) ??
      tileTopCentre(impact.impact);
    const attackerId = impact.attackerId;
    const attacker = this.scene.unitObject(attackerId);
    const motion = this.scene.unitMotion?.(attackerId);
    const originalYaw = attacker?.rotation.y;
    const melee = isMeleeRange(impact.weaponRange);
    // The shell flies at the body of what it was aimed at, or at the
    // tile: a shot at the ground bursts a little above it.
    const aim =
      (aimed && this.anchor(aimed.payload.targetId, BODY_FRACTION)) ??
      (aimed && this.spawnerTop(aimed.payload.targetId)) ??
      ({ x: ground.x, y: ground.y + BLAST_LIFT, z: ground.z } satisfies Vec3);
    // A placed charge goes off where it lies (#1132): nothing leaves
    // the squad that set it, which may be far off or gone by now.
    const placed = impact.delivery === "placed";
    if (attacker && !placed) {
      faceTowards(attacker, attacker.position, aim);
    }
    const muzzle = placed
      ? undefined
      : this.anchor(attackerId, MUZZLE_FRACTION);
    const flightSeconds = melee || placed ? 0 : this.timing.tracerSeconds;
    const landsAt = placed ? 0 : this.timing.flashSeconds * 0.5 + flightSeconds;
    const poseSeconds =
      this.timing.flashSeconds + flightSeconds + this.timing.impactSeconds;

    const numbers: {
      readonly at: Vec3;
      readonly label: string;
      readonly tone: number;
    }[] = [];
    if (aimed && !impact.smoke) {
      const at =
        this.anchor(aimed.payload.targetId, 1, TEXT_MARGIN) ??
        this.spawnerTop(aimed.payload.targetId);
      if (at) {
        numbers.push({
          at,
          label: aimed.payload.hit
            ? `-${String(aimed.payload.damage)}`
            : "MISS",
          tone: aimed.payload.hit ? DAMAGE_COLOUR : MISS_COLOUR,
        });
      }
    }
    for (const victim of impact.victims) {
      if (impact.smoke) continue;
      const at =
        victim.kind === "unit"
          ? this.anchor(victim.targetId, 1, TEXT_MARGIN)
          : this.spawnerTop(victim.targetId);
      if (at) {
        numbers.push({
          at,
          label: `-${String(victim.damage)}`,
          tone: DAMAGE_COLOUR,
        });
      }
    }
    if (!impact.hit && impact.aimedAtTile) {
      numbers.push({
        at: { x: ground.x, y: ground.y + TILE_TEXT_LIFT, z: ground.z },
        label: "MISS",
        tone: MISS_COLOUR,
      });
    }

    const beamGround = impact.beamEnd
      ? (this.scene.tileWorldPosition(impact.beamEnd) ??
        tileTopCentre(impact.beamEnd))
      : undefined;
    const beamAim = beamGround
      ? { x: beamGround.x, y: beamGround.y + aim.y - ground.y, z: beamGround.z }
      : aim;
    const parts: ScheduledPart[] = [
      {
        at: 0,
        start: () =>
          impact.beam
            ? this.beam(muzzle, beamAim)
            : this.shot(muzzle, aim, melee),
      },
    ];
    if (impact.hit && !impact.beam && !impact.smoke) {
      parts.push({
        at: landsAt,
        start: () => this.explosion(aim, impact.radius),
      });
    }
    if (numbers.length > 0) {
      parts.push({ at: landsAt, start: () => this.numbers(numbers) });
    }
    for (const event of events) {
      switch (event.type) {
        case UNIT_DIED:
          parts.push({
            at: landsAt,
            start: () => this.fade(event.payload.unitId),
          });
          break;
        case TURRET_DESTROYED:
          parts.push({
            at: landsAt,
            start: () => this.fade(event.payload.turretId),
          });
          break;
        case CIVILIANS_KILLED:
          parts.push({
            at: landsAt,
            start: () => this.fade(event.payload.unitId),
          });
          break;
        case SPAWNER_DAMAGED:
          parts.push({
            at: landsAt,
            start: () => this.spawnerBurst(event.payload),
          });
          break;
        case STRUCTURE_DESTROYED:
          parts.push({ at: landsAt, start: () => this.rubble(event.payload) });
          break;
        default:
          break;
      }
    }

    let elapsed = 0;
    const cleanup = (): void => {
      motion?.reset();
      if (attacker && originalYaw !== undefined) {
        attacker.rotation.y = originalYaw;
      }
    };
    const inner = scheduled(`blast:${attackerId}`, parts);
    return {
      name: inner.name,
      advance: (seconds) => {
        elapsed += seconds;
        motion?.attack(Math.min(1, elapsed / poseSeconds), melee);
        const leftover = inner.advance(seconds);
        if (leftover !== undefined) {
          cleanup();
        }
        return leftover;
      },
      finish: () => {
        inner.finish();
        cleanup();
      },
    };
  }

  /** A short, continuous cyan beam across the complete firing lane. */
  private beam(muzzle: Vec3 | undefined, aim: Vec3): Animation | undefined {
    if (!muzzle) return undefined;
    const start = new Vector3(muzzle.x, muzzle.y, muzzle.z);
    const end = new Vector3(aim.x, aim.y, aim.z);
    const direction = end.clone().sub(start);
    const geometry = new CylinderGeometry(0.045, 0.045, direction.length(), 6);
    const material = new MeshBasicMaterial({
      color: 0x9eefff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const beam = new Mesh(geometry, material);
    beam.name = "vfx.mech-beam";
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.normalize(),
    );
    this.root.add(beam);
    const duration =
      this.timing.flashSeconds +
      this.timing.tracerSeconds +
      this.timing.impactSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      beam.removeFromParent();
      geometry.dispose();
      material.dispose();
    };
    return {
      name: "beam",
      advance: (seconds) => {
        elapsed += seconds;
        material.opacity = Math.max(0, 1 - elapsed / duration);
        if (elapsed < duration) return undefined;
        cleanup();
        return elapsed - duration;
      },
      finish: cleanup,
    };
  }

  /**
   * The shot leaving the shooter: the muzzle flash, or the claw slash
   * at the mark, and the tracer's flight to `aim`. Nothing lands here;
   * the explosion is scheduled to the instant the tracer arrives.
   *
   * @param muzzle - Where the shot leaves, or undefined when the shooter is not drawn.
   * @param aim - Where it is going.
   * @param melee - A swing rather than a shot: no tracer.
   */
  private shot(
    muzzle: Vec3 | undefined,
    aim: Vec3,
    melee: boolean,
  ): Animation | undefined {
    const flash = this.openingFlash(muzzle, aim, melee);
    const tracer =
      melee || !muzzle
        ? undefined
        : this.billboard("vfx.tracer", muzzle, TRACER_THICKNESS, 0xffffff, {
            width: TRACER_THICKNESS * 3,
            rotation: this.screenAngle(muzzle, aim),
          });
    if (!flash && !tracer) {
      return undefined;
    }
    const flashSeconds = this.timing.flashSeconds;
    const flightSeconds = melee ? 0 : this.timing.tracerSeconds;
    const total = Math.max(flashSeconds, flashSeconds * 0.5 + flightSeconds);
    let elapsed = 0;
    const cleanup = (): void => {
      for (const sprite of [flash, tracer]) {
        if (sprite) {
          this.removeSprite(sprite);
        }
      }
    };
    return {
      name: "shot",
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
        if (tracer && muzzle) {
          const phase = Math.min(
            1,
            Math.max(0, (elapsed - flashSeconds * 0.5) / flightSeconds),
          );
          tracer.position.set(
            muzzle.x + (aim.x - muzzle.x) * phase,
            muzzle.y + (aim.y - muzzle.y) * phase,
            muzzle.z + (aim.z - muzzle.z) * phase,
          );
          tracer.visible = elapsed >= flashSeconds * 0.5 && phase < 1;
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

  /**
   * The explosion itself (#1130): the spark core the impact sprite
   * draws, a fireball glow behind it and a shockwave ring running out
   * past the footprint, all sized to the radius and all gone within a
   * death's duration.
   *
   * @param at - The point of impact in world space.
   * @param radius - Tiles the blast reached; sizes every layer.
   */
  private explosion(at: Vec3, radius: number): Animation {
    const size = BLAST_BASE_SIZE + BLAST_SIZE_PER_TILE * radius;
    const core = this.billboard(
      "vfx.impact",
      at,
      size * BLAST_CORE_SHARE,
      0xffffff,
    );
    this.glowTexture ??= createFalloffTexture();
    this.ringTexture ??= createBlastRingTexture();
    const glow = this.billboard(
      undefined,
      at,
      size * BLAST_GLOW_START,
      BLAST_GLOW_COLOUR,
      { texture: this.glowTexture, additive: true, name: "vfx.blast-glow" },
    );
    const ring = this.billboard(
      undefined,
      at,
      size * BLAST_RING_START,
      BLAST_RING_COLOUR,
      { texture: this.ringTexture, additive: true, name: "vfx.blast-ring" },
    );
    const seconds = this.timing.deathSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      for (const sprite of [core, glow, ring]) {
        this.removeSprite(sprite);
      }
    };
    return {
      name: "explosion",
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const phase = elapsed / seconds;
        // Ease out: fast at first, then coasting, as a pressure wave does.
        const eased = 1 - (1 - phase) * (1 - phase);
        const coreScale = size * BLAST_CORE_SHARE * (1 + phase * BLAST_GROWTH);
        core.scale.set(coreScale, coreScale, 1);
        core.material.opacity = 1 - phase;
        const glowScale =
          size *
          (BLAST_GLOW_START + (BLAST_GLOW_END - BLAST_GLOW_START) * eased);
        glow.scale.set(glowScale, glowScale, 1);
        glow.material.opacity = (1 - phase) * (1 - phase);
        const ringScale =
          size *
          (BLAST_RING_START + (BLAST_RING_END - BLAST_RING_START) * eased);
        ring.scale.set(ringScale, ringScale, 1);
        ring.material.opacity = 1 - phase;
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
   * Every number a blast puts up, rising and fading together: the one
   * over the aimed target, one over each victim, or MISS over the tile.
   *
   * @param numbers - Where each goes, what it says and in which tone.
   */
  private numbers(
    numbers: readonly {
      readonly at: Vec3;
      readonly label: string;
      readonly tone: number;
    }[],
  ): Animation {
    const floaters = numbers.map(({ at, label, tone }) => ({
      sprite: this.billboard(undefined, at, FLOATER_WIDTH, 0xffffff, {
        label,
        tone,
        aspect: 0.42,
      }),
      baseY: at.y,
    }));
    const seconds = this.timing.floaterSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      for (const { sprite } of floaters) {
        this.removeSprite(sprite);
      }
    };
    return {
      name: "numbers",
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const phase = elapsed / seconds;
        for (const { sprite, baseY } of floaters) {
          sprite.position.y = baseY + FLOATER_RISE * phase;
          sprite.material.opacity = Math.min(1, (1 - phase) * 1.5);
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
   * A structure coming down (#1121): a puff over the tile it stood on,
   * swelling as it fades. The map view collapses the prop or wall
   * itself when the scene redraws, after this has played.
   */
  private rubble(payload: StructureDestroyedPayload): Animation | undefined {
    const ground = this.scene.tileWorldPosition(payload.tile);
    if (!ground) {
      return undefined;
    }
    const at = { x: ground.x, y: ground.y + 0.4, z: ground.z };
    const sprite = this.billboard("vfx.tdf-death", at, RUBBLE_SIZE, 0xffffff);
    const seconds = this.timing.deathSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      this.removeSprite(sprite);
    };
    return {
      name: `rubble:${String(payload.tile.x)},${String(payload.tile.z)}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const progress = elapsed / seconds;
        const scale = RUBBLE_SIZE * (1 + progress * BURST_GROWTH);
        sprite.scale.set(scale, scale, 1);
        sprite.material.opacity = 1 - progress;
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
   * A unit or spawner burning on a fire's turn (#1121): the damage
   * number in the flame's colour, rising as any damage number does.
   */
  private burn(payload: EffectDamagedPayload): Animation | undefined {
    const at =
      payload.targetKind === "unit"
        ? this.anchor(payload.targetId, 1, TEXT_MARGIN)
        : this.spawnerTop(payload.targetId);
    if (!at) {
      return undefined;
    }
    const floater = this.billboard(undefined, at, FLOATER_WIDTH, 0xffffff, {
      label: `-${String(payload.damage)}`,
      tone: BURN_COLOUR,
      aspect: 0.42,
    });
    const seconds = this.timing.floaterSeconds;
    let elapsed = 0;
    const cleanup = (): void => {
      this.removeSprite(floater);
    };
    return {
      name: `burn:${payload.targetId}`,
      advance: (delta) => {
        const leftover = Math.max(0, elapsed + delta - seconds);
        elapsed = Math.min(seconds, elapsed + delta);
        const phase = elapsed / seconds;
        floater.position.y = at.y + FLOATER_RISE * phase;
        floater.material.opacity = Math.min(1, (1 - phase) * 1.5);
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
   * A medkit or a repair kit landing (#1138): `+N` in green over every
   * unit it mended, rising together as a blast's numbers do — the same
   * floater with the sign turned round, and nothing else, so a heal is
   * as modest on the screen as it is in the rules. Skipped, with the
   * callback still made, when the scene has none of the units.
   */
  private heal(payload: UnitsHealedPayload): Animation | undefined {
    const numbers = payload.healed.flatMap((unit) => {
      const at = this.anchor(unit.unitId, 1, TEXT_MARGIN);
      return at
        ? [{ at, label: `+${String(unit.amount)}`, tone: HEAL_COLOUR }]
        : [];
    });
    return numbers.length === 0 ? undefined : this.numbers(numbers);
  }

  // ===========================================
  // Private Methods: anchoring
  // ===========================================

  /** The point above an egg spawner a number rises from, or undefined while it loads. */
  private spawnerTop(spawnerId: SpawnerId): Vec3 | undefined {
    const base = this.scene.spawnerWorldPosition(spawnerId);
    if (!base) {
      return undefined;
    }
    const height = this.scene.spawnerHeight(spawnerId) ?? FALLBACK_HEIGHT;
    return { x: base.x, y: base.y + height + TEXT_MARGIN, z: base.z };
  }

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
      /** Canvas width for the text chip; wider for a sentence than for a number. */
      readonly chipWidth?: number;
      readonly tone?: number;
      readonly width?: number;
      readonly aspect?: number;
      readonly rotation?: number;
      /**
       * Draw the chip to fit its words and size the sprite from the
       * chip: `size` is then the height, and the width follows the text.
       */
      readonly fitLabel?: boolean;
      /**
       * A texture of the caller's own instead of a manifest sprite or a
       * chip (#1130): the procedural explosion layers. Shared and owned
       * by the queue, so never disposed with the sprite.
       */
      readonly texture?: Texture;
      /** Add light rather than paint over, for a glow or a wave. */
      readonly additive?: boolean;
      /** The sprite's name in the scene graph, when `id` does not give one. */
      readonly name?: string;
    } = {},
  ): Sprite {
    // An effect with a frame sheet plays it; the single-frame image is
    // the fallback for when the sheet has not loaded yet (#697). Every
    // effect drew as one frozen frame until this, because nothing read
    // the `sheet` descriptor the manifest has carried since #396.
    const sheetId = id === undefined ? undefined : sheetIdFor(id);
    const sheetTexture = sheetId ? this.textures.get(sheetId) : undefined;
    const sheet = sheetId ? entryOf(sheetId).sheet : undefined;
    const animated =
      options.texture === undefined &&
      sheetTexture !== undefined &&
      sheet !== undefined;
    const texture =
      options.texture ??
      (animated
        ? sheetTexture.clone()
        : id
          ? this.textures.get(id)
          : chipTexture(
              options.label,
              options.tone ?? colour,
              options.chipWidth,
              options.fitLabel ?? false,
            ));
    const blend =
      options.additive === true ||
      (id && SPRITE_MANIFEST[id].blend === "additive")
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
    if (options.fitLabel && texture) {
      const image = texture.image as { width: number; height: number };
      sprite.scale.set((size * image.width) / image.height, size, 1);
    } else {
      sprite.scale.set(options.width ?? size, size * (options.aspect ?? 1), 1);
    }
    sprite.position.set(at.x, at.y, at.z);
    sprite.name = options.name ?? id ?? `vfx.floater:${options.label ?? ""}`;
    // Effects belong on top of the unit they describe, never behind it.
    sprite.renderOrder = 10;
    this.root.add(sprite);
    this.live.add(sprite);
    if (animated && texture) {
      // A clone per sprite: the cached texture is shared by every effect
      // of this id, and stepping its offset would step all of them.
      texture.needsUpdate = true;
      texture.repeat.set(1 / sheet.columns, 1 / sheet.rows);
      this.playing.set(sprite, { sheet, texture, elapsedMs: 0 });
      showFrame(texture, sheet, 0);
    }
    return sprite;
  }

  /**
   * Advances every playing frame sheet (#697).
   *
   * Here rather than inside each animation because a sheet belongs to
   * the *sprite*, not to whatever queued it: a muzzle flash and a death
   * burst step the same way, and an effect that outlives its animation
   * should keep playing.
   *
   * Plays once and holds the last frame. Looping would restart a death
   * burst while the corpse is still fading, which reads as a second
   * explosion rather than one.
   *
   * @param deltaSeconds - Frame delta.
   */
  private stepSheets(deltaSeconds: number): void {
    for (const playback of this.playing.values()) {
      playback.elapsedMs += deltaSeconds * 1000;
      const index = Math.min(
        playback.sheet.frames - 1,
        Math.floor(playback.elapsedMs / playback.sheet.frameMs),
      );
      showFrame(playback.texture, playback.sheet, index);
    }
  }

  /** Removes and disposes a billboard; safe to call twice. */
  private removeSprite(sprite: Sprite): void {
    if (!this.live.delete(sprite)) {
      return;
    }
    sprite.removeFromParent();
    const playback = this.playing.get(sprite);
    if (playback) {
      // The clone is this sprite's alone, so it goes with it.
      playback.texture.dispose();
      this.playing.delete(sprite);
    }
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

/**
 * The frame-sheet id for an effect, when one is registered.
 *
 * The sheets are named for the sprite they animate -- `vfx.impact` and
 * `vfx.impact-sheet` -- so the mapping needs no second table to drift
 * out of step with the manifest.
 *
 * @param id - The single-frame effect id.
 * @returns The sheet id, or undefined when the effect has no sheet.
 */
function sheetIdFor(id: SpriteId): SpriteId | undefined {
  const candidate = `${id}-sheet`;
  return candidate in SPRITE_MANIFEST &&
    entryOf(candidate as SpriteId).sheet !== undefined
    ? (candidate as SpriteId)
    : undefined;
}

/**
 * One manifest entry at its declared type.
 *
 * The manifest is a `satisfies` literal, so indexing it narrows to the
 * exact entry and an entry without a sheet has no `sheet` property to
 * read at all. Widening here keeps that check in one place.
 *
 * @param id - The sprite to look up.
 * @returns Its entry, typed as the interface rather than the literal.
 */
function entryOf(id: SpriteId): SpriteAssetEntry {
  return SPRITE_MANIFEST[id];
}

/**
 * Points a texture at one frame of its sheet.
 *
 * Frames read left to right then top to bottom, while a texture's
 * origin is bottom-left, so the row is counted from the far end.
 *
 * @param texture - The sprite's own cloned texture.
 * @param sheet - Its frame layout.
 * @param index - Frame to show, already clamped.
 */
function showFrame(texture: Texture, sheet: SpriteSheet, index: number): void {
  const column = index % sheet.columns;
  const row = Math.floor(index / sheet.columns);
  texture.offset.set(column / sheet.columns, 1 - (row + 1) / sheet.rows);
}

/** True when two points coincide. */
function samePoint(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/**
 * Several animations as one, each starting at its own offset from the
 * whole's start and all advancing together from then on (#1130). The
 * whole finishes when the last part does, handing back whatever time
 * that part had left over.
 *
 * ```
 *   at 0     ├── shot ──┤
 *   at 0.24            ├──── explosion ────┤
 *   at 0.24            ├── numbers ─────────────┤   ← finishes the whole
 *   at 0.24            ├── fade ──┤
 * ```
 *
 * Parts are built when their moment comes, not when the whole is
 * assembled, so a sprite appears at its offset and a unit that is to
 * fade stands whole until then. A part with nothing to show is simply
 * skipped.
 *
 * @param name - The whole's name.
 * @param parts - What to play and when; any order.
 * @returns The composite.
 */
function scheduled(name: string, parts: readonly ScheduledPart[]): Animation {
  const queue = [...parts].sort((a, b) => a.at - b.at);
  const running: Animation[] = [];
  let elapsed = 0;
  let nextPart = 0;
  return {
    name,
    advance: (seconds) => {
      const before = elapsed;
      elapsed += seconds;
      let leftover = Number.POSITIVE_INFINITY;
      const step = (animation: Animation, span: number): boolean => {
        const left = animation.advance(span);
        if (left === undefined) {
          return false;
        }
        leftover = Math.min(leftover, left);
        return true;
      };
      for (const animation of [...running]) {
        if (step(animation, seconds)) {
          running.splice(running.indexOf(animation), 1);
        }
      }
      for (; nextPart < queue.length; nextPart++) {
        const part = queue[nextPart];
        if (part === undefined || part.at > elapsed) {
          break;
        }
        const animation = part.start();
        if (
          animation &&
          !step(animation, elapsed - Math.max(before, part.at))
        ) {
          running.push(animation);
        }
      }
      if (running.length > 0 || nextPart < queue.length) {
        return undefined;
      }
      const lastAt = queue[queue.length - 1]?.at ?? 0;
      return Number.isFinite(leftover)
        ? leftover
        : Math.max(0, elapsed - lastAt);
    },
    finish: () => {
      for (; nextPart < queue.length; nextPart++) {
        const animation = queue[nextPart]?.start();
        if (animation) {
          running.push(animation);
        }
      }
      for (const animation of running.splice(0)) {
        animation.finish();
      }
    },
  };
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
  width = 256,
  fit = false,
): Texture | undefined {
  if (label === undefined || typeof document === "undefined") {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return undefined;
  }
  if (fit) {
    // Wide enough for the words at the chip's text size, never narrower
    // than a damage number's chip, so a one-word notice is still a chip.
    ctx.font = `bold ${String(CHIP_FIT_FONT_PX)}px ui-monospace, monospace`;
    const words = ctx.measureText(label).width;
    canvas.width = Math.max(
      width,
      Math.ceil(words) + CHIP_TEXT_INSET + CHIP_TEXT_MARGIN * 2,
    );
  } else {
    canvas.width = width;
  }
  width = canvas.width;
  const hex = `#${tone.toString(16).padStart(6, "0")}`;
  const box = width - 8;
  ctx.fillStyle = "rgba(20, 24, 33, 0.92)";
  ctx.fillRect(4, 16, box, 96);
  ctx.strokeStyle = "#2e3646";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 16, box, 96);
  ctx.fillStyle = hex;
  ctx.fillRect(4, 16, 18, 96);
  // Fits the words rather than assuming they are short (#1030). A damage
  // number is three characters and a refusal is a sentence; drawn at one
  // fixed size the sentence ran off both ends of the chip, which the
  // first captured frame showed plainly.
  const room = box - 18 - 16;
  let size = fit ? CHIP_FIT_FONT_PX + 2 : 76;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  do {
    ctx.font = `bold ${String(size)}px ui-monospace, monospace`;
    size -= 2;
  } while (size > 14 && ctx.measureText(label).width > room);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, 18 + (box - 18) / 2, 66);
  const texture = new CanvasTexture(canvas);
  texture.name = `vfx.floater:${label}`;
  return texture;
}

/** Turns the model's north-facing front along a horizontal segment. */
function faceTowards(object: Object3D, from: Vec3, to: Vec3): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx !== 0 || dz !== 0) object.rotation.y = Math.atan2(-dx, -dz);
}
