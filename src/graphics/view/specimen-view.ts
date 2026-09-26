import type { Material, Object3D } from "three";
import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { Disposable } from "../model/disposable";
import type { ModelLoader } from "../model/model-loader";
import { tileTopCentre } from "./tactical-map-view";

// ===========================================
// Constants
// ===========================================

/** Name of the net dome over a dropped specimen, for tests and scene inspection. */
export const SPECIMEN_NET_NAME = "specimen-net";

/**
 * How big a netted bug is drawn against a free one of its kind: bundled
 * up, it reads smaller, and a whole-size lurker on a tile where a squad
 * fell would read as a live one standing over the body.
 */
export const SPECIMEN_SCALE = 0.7;

/**
 * Multiplied into the bug's own colours: a pale, cold grey that says
 * "bound and still" without hiding the species.
 */
export const SPECIMEN_TINT = 0xa9b3bd;

/** The net's cord colour: undyed rope, bright against the bug and the ground. */
export const NET_COLOUR = 0xe8dcb0;

/** How far the net stands clear of the bundled bug, as a share of its size. */
const NET_CLEARANCE = 1.15;

/** The net's mesh: a coarse dome, few enough segments that the cords read as rope. */
const NET_SEGMENTS = { around: 10, down: 5 } as const;

// ===========================================
// Types
// ===========================================

/**
 * One dropped specimen as the scene draws it (#1179): where it lies and
 * which model its species is drawn with. Named by the fallen carrier's
 * id, which is what names the specimen in the mission.
 */
export interface SpecimenPlacement {
  readonly id: string;
  readonly pos: TileCoord;
  readonly modelId: ModelAssetId;
}

/** One placed specimen: its object and the tinted materials it owns. */
interface DrawnSpecimen {
  readonly root: Object3D;
  readonly materials: readonly Material[];
}

// ===========================================
// Specimen view
// ===========================================

/**
 * The live specimens lying where their carriers fell (#1179): each is
 * its species' own model, scaled down and tinted grey, under a dome of
 * rope netting, so a dropped lurker reads as a captured one waiting to
 * be picked up rather than as a bug standing on the tile.
 *
 * ```
 *   specimen:<carrierId>   (Group, at the tile's top centre)
 *   ├── model             the species' model, ×SPECIMEN_SCALE, tinted SPECIMEN_TINT
 *   └── specimen-net      a wire dome over it, NET_COLOUR
 *
 *   updateSpecimens(placements)
 *     ├─ gone (picked up) ──► removed, its tinted materials freed
 *     └─ new              ──► models.load(modelId) ──► placed (unless gone meanwhile)
 * ```
 *
 * Not pickable: the player clicks the tile it lies on, and the wheel's
 * Pick up entry finds it there. Observes state only; a specimen never
 * moves while it lies, so one placed is kept until it is gone.
 */
export class SpecimenView implements Disposable {
  // ===========================================
  // Fields
  // ===========================================

  readonly root = new Group();
  private readonly drawn = new Map<string, DrawnSpecimen>();
  /** Specimens the latest update asked for; a load that finishes for one no longer here is dropped. */
  private readonly wanted = new Set<string>();
  /** One dome shared by every net; each is scaled to its bug. */
  private readonly netGeometry = new SphereGeometry(
    0.5,
    NET_SEGMENTS.around,
    NET_SEGMENTS.down,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  private readonly netMaterial = new MeshBasicMaterial({
    color: NET_COLOUR,
    wireframe: true,
  });

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Creates an empty layer.
   *
   * @param models - Loads each species' model; the loader owns the prototypes.
   */
  constructor(private readonly models: ModelLoader) {
    this.root.name = "specimens";
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Ids of the specimens drawn or loading, in the order they were first asked for. */
  ids(): readonly string[] {
    return [...this.wanted];
  }

  /**
   * Brings the drawn specimens in step with `placements`: one picked up
   * (gone from the list) is removed, a new one is loaded and laid on its
   * tile. Resolves when every new model has loaded.
   *
   * @param placements - Every dropped specimen the player knows of.
   */
  async updateSpecimens(
    placements: readonly SpecimenPlacement[],
  ): Promise<void> {
    const keep = new Set(placements.map((placement) => placement.id));
    for (const id of [...this.wanted]) {
      if (!keep.has(id)) {
        this.remove(id);
      }
    }
    const loads: Promise<void>[] = [];
    for (const placement of placements) {
      if (this.wanted.has(placement.id)) {
        continue;
      }
      this.wanted.add(placement.id);
      loads.push(this.place(placement));
    }
    await Promise.all(loads);
  }

  /** Removes every specimen, cancels late loads and frees the net. */
  dispose(): void {
    for (const id of [...this.wanted]) {
      this.remove(id);
    }
    this.netGeometry.dispose();
    this.netMaterial.dispose();
    this.root.removeFromParent();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /** Loads the species' model and lays it, netted, on its tile; a late load is dropped. */
  private async place(placement: SpecimenPlacement): Promise<void> {
    const model = await this.models.load(placement.modelId);
    if (!this.wanted.has(placement.id) || this.drawn.has(placement.id)) {
      return;
    }
    const root = new Group();
    root.name = `specimen:${placement.id}`;
    const at = tileTopCentre(placement.pos);
    root.position.set(at.x, at.y, at.z);
    model.scale.multiplyScalar(SPECIMEN_SCALE);
    const materials = this.tint(model);
    root.add(model, this.netOver(model));
    this.drawn.set(placement.id, { root, materials });
    this.root.add(root);
  }

  /**
   * Replaces every material under `model` with a copy tinted
   * `SPECIMEN_TINT`, which this view owns: the loaded ones are shared
   * with every free bug of the species.
   *
   * @returns The copies, to free when the specimen goes.
   */
  private tint(model: Object3D): Material[] {
    const tint = new Color(SPECIMEN_TINT);
    const owned: Material[] = [];
    model.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      const current = node.material as Material | Material[];
      const materials = Array.isArray(current) ? current : [current];
      const copies = materials.map((material) => {
        const copy = material.clone() as Material & { color?: Color };
        copy.color?.multiply(tint);
        owned.push(copy);
        return copy;
      });
      node.material = Array.isArray(current) ? copies : copies[0]!;
    });
    return owned;
  }

  /** A net dome sized to the bundled bug's bounds, standing just clear of it. */
  private netOver(model: Object3D): Mesh {
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    // An empty model (a stand-in with no meshes) still gets a tile-sized net.
    const width = Math.max(size.x, size.z, 0.4) * NET_CLEARANCE;
    const height = Math.max(size.y, 0.2) * NET_CLEARANCE;
    const net = new Mesh(this.netGeometry, this.netMaterial);
    net.name = SPECIMEN_NET_NAME;
    net.scale.set(width, height * 2, width);
    return net;
  }

  /** Takes a specimen off the board and frees the materials it owned. */
  private remove(id: string): void {
    this.wanted.delete(id);
    const drawn = this.drawn.get(id);
    if (drawn === undefined) {
      return;
    }
    this.drawn.delete(id);
    drawn.root.removeFromParent();
    for (const material of drawn.materials) {
      material.dispose();
    }
  }
}
