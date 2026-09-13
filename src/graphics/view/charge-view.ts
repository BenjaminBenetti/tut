import type { Object3D } from "three";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";

import type { PlacedCharge } from "../../tactical/model/equipment";
import type { Disposable } from "../model/disposable";
import type { FrameUpdatable } from "../model/frame-updatable";
import { tileTop } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** The charge's block: a satchel-sized box on the tile centre, in world units. */
const BODY_WIDTH = 0.3;
const BODY_HEIGHT = 0.16;
const BODY_DEPTH = 0.2;

/** The arming light on top: a small cube that blinks. */
const LAMP_SIZE = 0.06;

/** Blink: on and off twice a second, so a set charge is never mistaken for a crate. */
const BLINK_HZ = 2;

/** Olive body, style-guide TDF drab; the lamp a warning red. */
const BODY_COLOUR = 0x4f5a3a;
const LAMP_ON = 0xff3b2f;
const LAMP_OFF = 0x5a1410;

// ===========================================
// ChargeView
// ===========================================

/** One drawn charge: its group and the lamp that blinks. */
interface DrawnCharge {
  readonly root: Group;
  readonly lamp: Mesh;
}

/**
 * Draws the mission's placed breaching charges (#1132): a small drab
 * block on the tile with a red lamp blinking on top, from the moment it
 * is set until it goes off. Placeholder geometry until art lands
 * (architecture §7).
 *
 * ```
 *   updateCharges(charges) ──► one group per charge id: added, kept, or removed
 *   update(dt)             ──► every lamp blinks on the frame clock
 * ```
 */
export class ChargeView implements FrameUpdatable, Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root: Group;
  private readonly charges = new Map<string, DrawnCharge>();
  private readonly bodyGeometry = new BoxGeometry(
    BODY_WIDTH,
    BODY_HEIGHT,
    BODY_DEPTH,
  );
  private readonly lampGeometry = new BoxGeometry(
    LAMP_SIZE,
    LAMP_SIZE,
    LAMP_SIZE,
  );
  private readonly body = new MeshBasicMaterial({ color: BODY_COLOUR });
  private readonly lampOn = new MeshBasicMaterial({ color: LAMP_ON });
  private readonly lampOff = new MeshBasicMaterial({ color: LAMP_OFF });
  private clock = 0;

  // ===========================================
  // Constructor
  // ===========================================

  /** Builds the empty group. */
  constructor() {
    this.root = new Group();
    this.root.name = "charges";
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Brings the drawn charges in step with `charges`: one that went off
   * or was never here is removed, one that is new is built.
   *
   * @param charges - The placed charges to draw.
   */
  updateCharges(charges: readonly PlacedCharge[]): void {
    const keep = new Set(charges.map((charge) => charge.id));
    for (const id of [...this.charges.keys()]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    for (const charge of charges) {
      if (!this.charges.has(charge.id)) {
        this.charges.set(charge.id, this.build(charge));
      }
    }
  }

  /** Ids of the charges currently drawn, for tests and the body attributes. */
  chargeIds(): readonly string[] {
    return [...this.charges.keys()];
  }

  /** Blinks every lamp. */
  update(deltaSeconds: number): void {
    this.clock += deltaSeconds;
    const lit = Math.floor(this.clock * BLINK_HZ * 2) % 2 === 0;
    for (const charge of this.charges.values()) {
      charge.lamp.material = lit ? this.lampOn : this.lampOff;
    }
  }

  /** The drawn objects, for tests. */
  objects(): readonly Object3D[] {
    return [...this.charges.values()].map((charge) => charge.root);
  }

  /** Removes every charge and frees the shared geometry and materials. */
  dispose(): void {
    for (const id of [...this.charges.keys()]) {
      this.remove(id);
    }
    this.bodyGeometry.dispose();
    this.lampGeometry.dispose();
    this.body.dispose();
    this.lampOn.dispose();
    this.lampOff.dispose();
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Builds one charge on its tile: the block, and the lamp on top. */
  private build(charge: PlacedCharge): DrawnCharge {
    const root = new Group();
    root.name = `charge:${charge.id}`;
    const top = tileTop(charge.tile.y);
    root.position.set(charge.tile.x + 0.5, top, charge.tile.z + 0.5);
    const body = new Mesh(this.bodyGeometry, this.body);
    body.position.y = BODY_HEIGHT / 2;
    const lamp = new Mesh(this.lampGeometry, this.lampOn);
    lamp.position.y = BODY_HEIGHT + LAMP_SIZE / 2;
    root.add(body, lamp);
    this.root.add(root);
    return { root, lamp };
  }

  /** Removes one charge's objects; the geometry and materials are shared and stay. */
  private remove(id: string): void {
    const charge = this.charges.get(id);
    if (charge === undefined) {
      return;
    }
    charge.root.removeFromParent();
    this.charges.delete(id);
  }
}
