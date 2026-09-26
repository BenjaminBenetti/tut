import type { Material, Object3D } from "three";
import { Box3, Color, Group, Mesh, Vector3 } from "three";

import type { MechWreck, MechWreckId } from "../../tactical/model/mech-wreck";
import { mechAssemblyFor } from "../data/part-model-table";
import type { Disposable } from "../model/disposable";
import type { MechAssembler } from "../service/mech-assembler";
import { unitFeetAt } from "../service/unit-placement";

// ===========================================
// Constants
// ===========================================

/**
 * What every colour of a wreck is multiplied by: burnt dark, but still
 * the mech the player built. The same kind of tint an offline
 * installation takes (`OFFLINE_DIM`), a multiplier on each material's
 * own colour, so the palette atlas still reads through.
 */
export const WRECK_TINT = 0.2;

/**
 * Radians the wreck is rolled onto its side about its own forward axis:
 * short of flat, so it lies propped on a shoulder rather than as a
 * cut-out pressed into the ground.
 */
export const WRECK_ROLL = 1.35;

/** Radians it is pitched forward, so the fall reads as a fall and not a pose. */
export const WRECK_PITCH = 0.22;

/**
 * Radians it is turned about the vertical: across the isometric view's
 * diagonal, so its length shows at every camera yaw.
 */
export const WRECK_YAW = 0.6;

/** World units it is sunk into the ground, so it lies in the dirt rather than on it. */
export const WRECK_SINK = 0.08;

/** Prefix of each wreck's group name, for tests and scene inspection. */
export const WRECK_NAME_PREFIX = "wreck:";

// ===========================================
// Types
// ===========================================

/** What the view builds a wreck's mech with: the mech bay's assembler. */
export type WreckAssembler = Pick<MechAssembler, "assemble">;

/** One placed wreck: its group and the tinted materials it owns. */
interface DrawnWreck {
  readonly root: Object3D;
  readonly materials: readonly Material[];
}

// ===========================================
// Wreck view
// ===========================================

/**
 * The lost mechs lying on a wreck recovery's map (arc §6.6). Each is
 * the mech its loadout names, assembled as the mech bay and the field
 * draw it, then laid down: rolled onto its side, pitched forward, sunk
 * a little into its hook's middle tile, and darkened. It has no motion
 * rig and ticks nothing, so it lies still, and it is outside every
 * picking list: the wheel finds the wreck from the squad, not the
 * model.
 *
 * ```
 *   updateWrecks(wrecks)
 *     ├─ gone from the list ──► removed, its tinted materials freed
 *     ├─ already drawn      ──► kept (a wreck never moves)
 *     └─ new                ──► assemble(mechAssemblyFor(loadout))
 *                                 └─► tinted copies of its materials
 *                                 └─► rolled, pitched, turned, centred
 *                                     on its middle tile, sunk
 *
 *   root
 *   └── wreck:<id>        at the middle tile's top, yaw WRECK_YAW
 *       └── tilt          roll WRECK_ROLL, pitch WRECK_PITCH, offset
 *           └── mech      the assembled model, pivot at the feet
 * ```
 *
 * A stripped wreck stays on the board: the parts are carried out and
 * the frame is left where it fell.
 */
export class WreckView implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. */
  readonly root = new Group();
  private readonly drawn = new Map<MechWreckId, DrawnWreck>();
  /** Wrecks the latest update asked for; a load that outlives its wreck is dropped. */
  private readonly wanted = new Set<MechWreckId>();

  // ===========================================
  // Constructor
  // ===========================================

  /** @param assembler - Builds each wreck's mech from its loadout's parts. */
  constructor(private readonly assembler: WreckAssembler) {
    this.root.name = "wrecks";
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /**
   * Brings the drawn wrecks in step with `wrecks`: a wreck gone from the
   * list is removed, a new one is assembled and laid down. Resolves when
   * every new wreck has loaded.
   *
   * @param wrecks - The wrecks the player may see.
   */
  async updateWrecks(wrecks: readonly MechWreck[]): Promise<void> {
    const keep = new Set(wrecks.map((wreck) => wreck.id));
    for (const id of [...this.wanted]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    const loads: Promise<void>[] = [];
    for (const wreck of wrecks) {
      if (this.wanted.has(wreck.id)) {
        continue;
      }
      this.wanted.add(wreck.id);
      loads.push(this.place(wreck));
    }
    await Promise.all(loads);
  }

  /** Ids of the wrecks drawn or loading, in insertion order. */
  wreckIds(): readonly MechWreckId[] {
    return [...this.wanted];
  }

  /** The placed group for a wreck, or undefined while it loads or once it is gone. */
  wreckObject(wreckId: MechWreckId): Object3D | undefined {
    return this.drawn.get(wreckId)?.root;
  }

  /** Removes every wreck, frees the tinted materials and detaches the root. */
  dispose(): void {
    for (const id of [...this.wanted]) {
      this.remove(id);
    }
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Assembles one wreck and lays it down, unless it was removed while loading. */
  private async place(wreck: MechWreck): Promise<void> {
    const model = await this.assembler.assemble(mechAssemblyFor(wreck.loadout));
    if (!this.wanted.has(wreck.id) || this.drawn.has(wreck.id)) {
      return;
    }
    const materials = tintWreck(model, WRECK_TINT);
    const root = layDown(model, wreck);
    this.drawn.set(wreck.id, { root, materials });
    this.root.add(root);
  }

  /** Forgets a wreck: its group, its tinted materials and any pending load. */
  private remove(wreckId: MechWreckId): void {
    this.wanted.delete(wreckId);
    const drawn = this.drawn.get(wreckId);
    if (drawn === undefined) {
      return;
    }
    for (const material of drawn.materials) {
      material.dispose();
    }
    drawn.root.removeFromParent();
    this.drawn.delete(wreckId);
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Gives every mesh under `model` its own copy of its materials,
 * multiplied by `tint`, with the lamps put out: the loader shares
 * materials between every clone of a part, so tinting them in place
 * would darken every mech on the field.
 *
 * @param model - The assembled mech; its meshes are re-pointed at the copies.
 * @param tint - The colour multiplier, 0 to 1.
 * @returns The copies, which the caller owns and disposes.
 */
export function tintWreck(model: Object3D, tint: number): Material[] {
  const owned: Material[] = [];
  model.traverse((node) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    node.castShadow = true;
    node.receiveShadow = true;
    const originals: Material[] = Array.isArray(node.material)
      ? (node.material as Material[])
      : [node.material as Material];
    const copies = originals.map((original) => {
      const copy = original.clone();
      darken(copy, tint);
      owned.push(copy);
      return copy;
    });
    node.material = Array.isArray(node.material) ? copies : copies[0];
  });
  return owned;
}

/** Multiplies a material's colour by `tint` and blacks out its emissive glow, where it has them. */
function darken(material: Material, tint: number): void {
  const coloured = material as Material & {
    color?: Color;
    emissive?: Color;
  };
  if (coloured.color instanceof Color) {
    coloured.color.multiplyScalar(tint);
  }
  if (coloured.emissive instanceof Color) {
    coloured.emissive.setScalar(0);
  }
  material.needsUpdate = true;
}

/**
 * Lays the model down on the wreck's middle tile: rolled and pitched
 * inside a tilt group, which is then shifted so the fallen body is
 * centred over the tile and sunk `WRECK_SINK` into it, and turned
 * about the vertical through that centre.
 *
 * @param model - The tinted mech, pivot at its feet.
 * @param wreck - Where it lies.
 * @returns The wreck's group, placed in world space.
 */
function layDown(model: Object3D, wreck: MechWreck): Group {
  const tilt = new Group();
  tilt.name = "tilt";
  tilt.rotation.set(WRECK_PITCH, 0, WRECK_ROLL);
  tilt.add(model);
  const root = new Group();
  root.name = `${WRECK_NAME_PREFIX}${wreck.id}`;
  root.add(tilt);
  // Measured before the yaw, with the group at the origin: the yaw turns
  // about the vertical through the centre, so it moves nothing the
  // offset has settled.
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(tilt);
  if (!box.isEmpty()) {
    const centre = box.getCenter(new Vector3());
    tilt.position.set(-centre.x, -box.min.y - WRECK_SINK, -centre.z);
  }
  const feet = unitFeetAt(wreck.pos, 1);
  root.position.set(feet.x, feet.y, feet.z);
  root.rotation.y = WRECK_YAW;
  return root;
}
