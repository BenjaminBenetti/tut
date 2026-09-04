import { Group } from "three";
import type { Object3D } from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { MechAssembly } from "../data/part-model-table";
import type { AssetLogger } from "../model/asset-logger";
import { ASSET_WARNING_PREFIX } from "../model/asset-logger";
import type { ModelLoader } from "../model/model-loader";

// ===========================================
// Types
// ===========================================

/** What the assembler is composed from. */
export interface MechAssemblerOptions {
  /** Resolves model ids to scene objects; every part is one `load` call. */
  readonly models: ModelLoader;
  /** Receives a warning when a part names a socket its host does not have. */
  readonly logger?: AssetLogger;
}

// ===========================================
// Constants
// ===========================================

/** Name of the group returned by `assemble`, so a scene can find it again. */
export const MECH_ROOT_NAME = "mech";

// ===========================================
// MechAssembler
// ===========================================

/**
 * Builds one mech from its part GLBs, hanging each part on the socket
 * the style guide gives it (§6). The parts pivot at their socket point
 * precisely so this is a parenting job and not a table of offsets.
 *
 * ```
 *   legs ─ socket_chassis ─► chassis ─┬─ socket_arm_l ─► arm-l
 *                                     ├─ socket_arm_r ─► arm-r ─ socket_weapon ─► arm weapon
 *                                     └─ socket_back  ─► back weapon
 * ```
 *
 * Every part is optional. A draft mid-edit can name a part with no
 * model, and the mech bay should keep drawing the rest rather than go
 * blank, so a missing part drops out of the chain and the parts below
 * it climb to the nearest host that exists — with no legs the chassis
 * is the root.
 *
 * A part whose host lacks the named socket is still added, at the
 * host's own origin, and the fact is logged: a mech missing an arm is
 * harder to notice than a mech wearing one in the wrong place, and the
 * warning names which model to re-export.
 */
export class MechAssembler {
  // ===========================================
  // Fields
  // ===========================================

  private readonly models: ModelLoader;
  private readonly logger: AssetLogger | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param options - Model loader and an optional logger for missing sockets. */
  constructor(options: MechAssemblerOptions) {
    this.models = options.models;
    this.logger = options.logger;
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Loads every named part and returns them assembled under one group,
   * pivoting at the base of the legs like any other unit model (§6).
   *
   * @param assembly - The models for each slot; absent slots are skipped.
   * @returns A new group the caller owns; never rejects for a registered id.
   */
  async assemble(assembly: MechAssembly): Promise<Object3D> {
    const [legs, chassis, armLeft, armRight, armWeapon, backWeapon] =
      await Promise.all([
        this.loadPart(assembly.legs),
        this.loadPart(assembly.chassis),
        this.loadPart(assembly.armLeft),
        this.loadPart(assembly.armRight),
        this.loadPart(assembly.armWeapon),
        this.loadPart(assembly.backWeapon),
      ]);

    const root = new Group();
    root.name = MECH_ROOT_NAME;
    // Each part hangs on the nearest host that loaded, so one absent
    // part costs its own picture and not the mech's.
    this.attach(legs, root, undefined);
    this.attach(chassis, legs ?? root, "socket_chassis");
    const torso = chassis ?? legs ?? root;
    this.attach(armLeft, torso, "socket_arm_l");
    this.attach(armRight, torso, "socket_arm_r");
    this.attach(backWeapon, torso, "socket_back");
    this.attach(armWeapon, armRight ?? torso, "socket_weapon");
    return root;
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Loads one part, or resolves to undefined when the slot names no model. */
  private loadPart(
    id: ModelAssetId | undefined,
  ): Promise<Object3D | undefined> {
    return id === undefined ? Promise.resolve(undefined) : this.models.load(id);
  }

  /**
   * Parents `part` to the named socket on `host`, or to `host` itself
   * when the socket is missing or none was asked for.
   */
  private attach(
    part: Object3D | undefined,
    host: Object3D,
    socket: string | undefined,
  ): void {
    if (!part) {
      return;
    }
    if (socket === undefined) {
      host.add(part);
      return;
    }
    const mount = host.getObjectByName(socket);
    if (!mount) {
      this.logger?.warn(
        `${ASSET_WARNING_PREFIX} Model "${host.name}" has no "${socket}"; "${part.name}" sits at its origin.`,
      );
      host.add(part);
      return;
    }
    mount.add(part);
  }
}
