import { Group } from "three";
import type { Object3D } from "three";

import type { UnitTemplate } from "../../tactical/model/unit-template";
import { mechAssemblyFor } from "../data/part-model-table";
import type { ModelLoader } from "../model/model-loader";
import type { UnitModelSource } from "../model/unit-model-source";
import { MechAssembler } from "./mech-assembler";

// ===========================================
// Types
// ===========================================

/** What the source needs from the environment. */
export interface LoadoutUnitModelSourceOptions {
  /** Loads whole models and parts alike. */
  readonly models: ModelLoader;
  /** Hangs parts on sockets; built over `models` when not given. */
  readonly assembler?: MechAssembler;
}

// ===========================================
// LoadoutUnitModelSource
// ===========================================

/**
 * `UnitModelSource` that draws a mech from the parts its loadout names
 * (#1115), through the same table and assembler the mech bay preview
 * uses, so the mech on the field is the one the player built. Every
 * other template, and a mech template without a loadout (a mission
 * saved before #1115), loads its `modelId` as before.
 *
 * ```
 *   template.loadout ──► mechAssemblyFor ──► assembler.assemble ──► flattenModel
 *   otherwise        ──► models.load(template.modelId)
 * ```
 *
 * The assembled group is flattened for the motion rig: the rig finds a
 * mech's limbs by name among the model's direct children, which is how
 * the reference GLBs are authored, and an assembly is a chain of
 * sockets instead. Flattening bakes each socket's offset into its parts
 * and puts them all beside each other, so the assembled mech walks and
 * recoils exactly as the reference does.
 */
export class LoadoutUnitModelSource implements UnitModelSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly models: ModelLoader;
  private readonly assembler: MechAssembler;

  // ===========================================
  // Constructor
  // ===========================================

  /** @param options - Model loader and an optional assembler over it. */
  constructor(options: LoadoutUnitModelSourceOptions) {
    this.models = options.models;
    this.assembler =
      options.assembler ?? new MechAssembler({ models: options.models });
  }

  // ===========================================
  // UnitModelSource
  // ===========================================

  /** Assembles a mech from its loadout, or loads the template's model. */
  async load(template: UnitTemplate): Promise<Object3D> {
    if (template.loadout === undefined) {
      return this.models.load(template.modelId);
    }
    const assembled = await this.assembler.assemble(
      mechAssemblyFor(template.loadout),
    );
    return flattenModel(assembled);
  }
}

// ===========================================
// Flattening
// ===========================================

/**
 * Re-parents every leaf of `root` (meshes and socket empties alike)
 * directly under a new group, keeping each one's world transform, so
 * the result has the flat shape of an authored unit GLB. Node names are
 * kept: a duplicate name across two parts (both arms have a
 * `shoulder`) is left as the reference assemblies leave it, since the
 * rig groups by prefix rather than by exact name.
 *
 * @param root - The assembled hierarchy; emptied and discarded.
 * @returns A flat group named as the root was.
 */
export function flattenModel(root: Object3D): Group {
  root.updateWorldMatrix(true, true);
  const flat = new Group();
  flat.name = root.name;
  const leaves: Object3D[] = [];
  root.traverse((node) => {
    if (node !== root && node.children.length === 0) {
      leaves.push(node);
    }
  });
  for (const leaf of leaves) {
    flat.attach(leaf);
  }
  return flat;
}
