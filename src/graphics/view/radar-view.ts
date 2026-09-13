import type { Object3D } from "three";
import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from "three";
import type { Radar, RadarContact } from "../../tactical/model/radar";
import { radarIsActive } from "../../tactical/model/radar";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import type { ModelLoader } from "../model/model-loader";
import { createFalloffTexture } from "../service/falloff-texture";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Names of the scanner GLB's nodes that make up its head: what turns on the mast. */
const HEAD_NODES: readonly string[] = ["dish", "dish_face", "feed_arm", "feed"];

/** Name of the pivot the head turns on, for tests and scene inspection. */
export const RADAR_HEAD_NAME = "radar-head";

/** Name of a dead scanner's smoke plume, for tests and scene inspection. */
export const RADAR_SMOKE_NAME = "radar-smoke";

/** Radians per second the head turns while the battery holds: one revolution every twenty seconds. */
export const HEAD_TURN_RATE = (2 * Math.PI) / 20;

/** Puffs per dead scanner; each rises, swells and fades on its own phase of one loop. */
const SMOKE_PUFFS = 3;

/** Seconds one puff takes from the dish to gone. */
const SMOKE_PERIOD = 2.4;

/** Where a puff is born, above the tile top: just over the dish (the model is 0.96 tall). */
const SMOKE_START_HEIGHT = 0.8;

/** How far a puff rises over its loop, in world units. */
const SMOKE_RISE = 0.9;

/** A puff's size at birth and how much it swells by the end. */
const SMOKE_BASE_SCALE = 0.18;
const SMOKE_GROWTH = 0.32;

/** Peak opacity of a puff; it fades in over the first quarter and out over the rest. */
const SMOKE_PEAK_OPACITY = 0.6;

/** Sideways wander of a rising puff. */
const SMOKE_DRIFT = 0.08;

/** Dark, sooty grey: an electrical fire, not a campfire. */
const SMOKE_COLOUR = 0x2f2f2f;

// ===========================================
// Types
// ===========================================

/** One puff of a plume: its sprite, its own material (opacity is per material) and its phase offset. */
interface SmokePuff {
  readonly sprite: Sprite;
  readonly material: SpriteMaterial;
  readonly offset: number;
}

/** One placed scanner: its model, the head that turns, and whether it still runs. */
interface DrawnScanner {
  readonly root: Object3D;
  /** The pivot the dish, its face and the feed turn on; the whole model when the GLB has no such nodes. */
  readonly head: Object3D;
  active: boolean;
  /** Present once the battery has died. */
  smoke?: { readonly root: Group; readonly puffs: readonly SmokePuff[] };
}

// ===========================================
// Radar view
// ===========================================

/**
 * Friendly scanner models and location blips, outside the enemy picking
 * lists. Since #1130 a scanner is a thing with a state: while its
 * battery holds its head turns slowly, and once it burns out the head
 * stops and a plume of dark smoke rises off the dish for as long as the
 * scanner stands.
 *
 * ```
 *   updateRadar(radars, contacts) ──► models placed / kept / removed,
 *                                     blips redrawn, each scanner's
 *                                     battery read off the state
 *   update(dt)                    ──► running heads turn, dead ones smoke
 * ```
 *
 * Observes state only: the battery is the mission's, read from each
 * `Radar` on every update, so a resumed save shows a dead scanner dead.
 */
export class RadarView implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root = new Group();
  private readonly contacts = new Group();
  private readonly scanners = new Map<string, DrawnScanner>();
  private wanted = new Set<string>();
  private readonly dot = new CircleGeometry(0.16, 20);
  private readonly unitHalo = new RingGeometry(0.25, 0.31, 24);
  private readonly structureHalo = new RingGeometry(0.3, 0.41, 4);
  private readonly material = new MeshBasicMaterial({
    color: 0xe0453c,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  /** Soft disc every smoke puff is cut from; owned here, shared by every plume. */
  private readonly smokeFalloff = createFalloffTexture();
  private clock = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /** Creates an empty layer; the shared loader owns model materials and buffers. */
  constructor(private readonly models: ModelLoader) {
    this.root.name = "radar";
    this.contacts.name = "radar-contacts";
    this.root.add(this.contacts);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Counts actually placed objects for the scene's diagnostic readout. */
  counts(): { scanners: number; contacts: number } {
    return {
      scanners: this.scanners.size,
      contacts: this.contacts.children.length,
    };
  }

  /**
   * Draws only supplied intel; hidden enemy models never enter this
   * layer. Every scanner's battery is read off `radars` on every call,
   * so a burnout shows on the next update from state and a resumed save
   * comes back smoking.
   */
  async updateRadar(
    radars: readonly Radar[],
    contacts: readonly RadarContact[],
  ): Promise<void> {
    this.wanted = new Set(radars.map((radar) => radar.id));
    for (const [id, drawn] of this.scanners) {
      if (!this.wanted.has(id)) {
        this.removeScanner(id, drawn);
      }
    }
    this.contacts.clear();
    for (const contact of contacts) {
      const blip = new Group();
      blip.name = `radar-contact-${contact.kind}`;
      const at = tileTopCentre(contact.pos);
      blip.position.set(at.x, at.y + 0.12, at.z);
      for (const geometry of [
        this.dot,
        contact.kind === "structure" ? this.structureHalo : this.unitHalo,
      ]) {
        const mark = new Mesh(geometry, this.material);
        mark.rotation.x = -Math.PI / 2;
        mark.renderOrder = 20;
        blip.add(mark);
      }
      this.contacts.add(blip);
    }
    await Promise.all(radars.map((radar) => this.place(radar)));
  }

  /** Turns every running head and breathes every dead scanner's smoke. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    for (const drawn of this.scanners.values()) {
      if (drawn.active) {
        drawn.head.rotation.y =
          (drawn.head.rotation.y + HEAD_TURN_RATE * deltaSeconds) %
          (2 * Math.PI);
      } else if (drawn.smoke !== undefined) {
        this.breathe(drawn.smoke.puffs);
      }
    }
  }

  /** Cancels late loads and frees only the geometry/materials owned by this view. */
  dispose(): void {
    this.wanted.clear();
    for (const [id, drawn] of this.scanners) {
      this.removeScanner(id, drawn);
    }
    this.contacts.clear();
    this.root.clear();
    this.root.removeFromParent();
    this.dot.dispose();
    this.unitHalo.dispose();
    this.structureHalo.dispose();
    this.material.dispose();
    this.smokeFalloff.dispose();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Places one scanner, discarding a load when the view no longer wants
   * it, or brings an already placed one in step with its battery.
   */
  private async place(radar: Radar): Promise<void> {
    const placed = this.scanners.get(radar.id);
    if (placed !== undefined) {
      this.applyBattery(placed, radar);
      return;
    }
    const model = await this.models.load("tdf.radar-scanner");
    if (!this.wanted.has(radar.id) || this.scanners.has(radar.id)) return;
    const at = tileTopCentre(radar.pos);
    model.position.set(at.x, at.y, at.z);
    model.name = radar.id;
    const drawn: DrawnScanner = {
      root: model,
      head: this.buildHead(model),
      active: true,
    };
    this.scanners.set(radar.id, drawn);
    this.root.add(model);
    this.applyBattery(drawn, radar);
  }

  /**
   * The pivot the head turns on: the GLB's dish, dish face, feed arm and
   * feed regrouped under one node at the model's origin, which is the
   * mast's axis. A model without those nodes — the placeholder when the
   * GLB failed to load — turns as a whole instead.
   */
  private buildHead(model: Object3D): Object3D {
    const parts = HEAD_NODES.map((name) => model.getObjectByName(name)).filter(
      (part): part is Object3D => part !== undefined,
    );
    if (parts.length === 0) {
      return model;
    }
    const head = new Group();
    head.name = RADAR_HEAD_NAME;
    // `add` reparents, keeping each part's local transform; the pivot
    // sits at the origin under the same root, so nothing moves.
    head.add(...parts);
    model.add(head);
    return head;
  }

  /** Reads the battery off the state: a dead scanner stops and starts smoking, once. */
  private applyBattery(drawn: DrawnScanner, radar: Radar): void {
    drawn.active = radarIsActive(radar);
    if (drawn.active || drawn.smoke !== undefined) {
      return;
    }
    const smoke = this.buildSmoke();
    drawn.root.add(smoke.root);
    drawn.smoke = smoke;
    this.breathe(smoke.puffs);
  }

  /** A plume of puffs over the dish, each on its own phase of the loop. */
  private buildSmoke(): NonNullable<DrawnScanner["smoke"]> {
    const root = new Group();
    root.name = RADAR_SMOKE_NAME;
    const puffs: SmokePuff[] = [];
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const material = new SpriteMaterial({
        color: SMOKE_COLOUR,
        alphaMap: this.smokeFalloff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new Sprite(material);
      sprite.renderOrder = 8;
      root.add(sprite);
      puffs.push({
        sprite,
        material,
        offset: (i / SMOKE_PUFFS) * SMOKE_PERIOD,
      });
    }
    return { root, puffs };
  }

  /** Moves every puff along its loop: born over the dish, rising, swelling, fading. */
  private breathe(puffs: readonly SmokePuff[]): void {
    for (const puff of puffs) {
      const t = ((this.clock + puff.offset) % SMOKE_PERIOD) / SMOKE_PERIOD;
      const scale = SMOKE_BASE_SCALE + SMOKE_GROWTH * t;
      puff.sprite.position.set(
        Math.sin((this.clock + puff.offset) * 1.3) * SMOKE_DRIFT * t,
        SMOKE_START_HEIGHT + SMOKE_RISE * t,
        Math.cos((this.clock + puff.offset) * 0.9) * SMOKE_DRIFT * t,
      );
      puff.sprite.scale.set(scale, scale, 1);
      puff.material.opacity = SMOKE_PEAK_OPACITY * Math.min(1, t * 4) * (1 - t);
    }
  }

  /** Removes one scanner and frees the materials its smoke owned; the model's are the loader's. */
  private removeScanner(id: string, drawn: DrawnScanner): void {
    if (drawn.smoke !== undefined) {
      for (const puff of drawn.smoke.puffs) {
        puff.material.dispose();
      }
      drawn.smoke.root.removeFromParent();
    }
    drawn.root.removeFromParent();
    this.scanners.delete(id);
  }
}
