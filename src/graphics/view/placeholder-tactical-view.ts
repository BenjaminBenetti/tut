import type { Object3D } from "three";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";

import type { Vec3 } from "../../core/model/grid";

// ===========================================
// Types
// ===========================================

/** Anything holding GPU resources that must be released explicitly. */
interface Disposable {
  /** Frees the underlying resources. */
  dispose(): void;
}

/** A style-guide palette token and its hex value. */
interface PaletteToken {
  readonly name: string;
  readonly hex: number;
}

/** A ground tile by column and row; `(x, z)` covers `[x, x + 1) × [z, z + 1)`. */
export interface GroundTile {
  readonly x: number;
  readonly z: number;
}

/** A box placed on a tile to show how tall things are at this zoom. */
export interface ScaleReference {
  readonly id: string;
  /** Height in world units. */
  readonly height: number;
  /** Tile the box stands on. */
  readonly tile: GroundTile;
  readonly material: PaletteToken;
}

// ===========================================
// Constants
// ===========================================

/** Side length of the placeholder map in tiles. */
export const PLACEHOLDER_MAP_SIZE = 16;

/** Checkerboard colours: temperate ground and secondary (style guide §4.3). */
const GROUND_EVEN: PaletteToken = { name: "env-grass", hex: 0x5e7a3a };
const GROUND_ODD: PaletteToken = { name: "env-dirt", hex: 0x7a6045 };

/** Scale references from style guide §3: infantry, one building floor, a mech. */
export const SCALE_REFERENCES: readonly ScaleReference[] = [
  {
    id: "infantry",
    height: 0.9,
    tile: { x: 4, z: 4 },
    material: { name: "tdf-olive", hex: 0x6b7a3f },
  },
  {
    id: "building-floor",
    height: 1.5,
    tile: { x: 8, z: 8 },
    material: { name: "env-concrete", hex: 0x8e8a82 },
  },
  {
    id: "mech",
    height: 2.6,
    tile: { x: 12, z: 12 },
    material: { name: "tdf-grey-mid", hex: 0x5b6573 },
  },
];

/** Boxes are inset from the tile edge so the checkerboard stays visible around them. */
const BOX_FOOTPRINT = 0.8;

// ===========================================
// View
// ===========================================

/**
 * Stand-in tactical scene until real map rendering exists: a checkerboard
 * of one-unit tiles and three boxes at style-guide heights. Tile `(x, z)`
 * covers `[x, x + 1) × [z, z + 1)` on the ground plane, matching the map
 * contract, so its centre is at `(x + 0.5, 0, z + 0.5)`.
 *
 * ```
 *   z ▼  x ▶
 *   ┌──┬──┬──┬──┐
 *   │▒▒│  │▒▒│  │   two InstancedMesh, one per colour,
 *   ├──┼──┼──┼──┤   so the whole floor is two draw calls
 *   │  │▒▒│  │▒▒│
 *   └──┴──┴──┴──┘
 * ```
 */
export class PlaceholderTacticalView {
  // ===========================================
  // Fields
  // ===========================================

  /** Add this to the scene. */
  readonly root: Group;
  private readonly size: number;
  private readonly disposables: Disposable[] = [];

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * Builds the geometry immediately.
   *
   * @param size - Map side length in tiles.
   */
  constructor(size: number = PLACEHOLDER_MAP_SIZE) {
    this.size = size;
    this.root = new Group();
    this.root.name = "placeholder-tactical";
    for (const mesh of this.buildGround()) {
      this.root.add(mesh);
    }
    for (const mesh of this.buildScaleReferences()) {
      this.root.add(mesh);
    }
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Ground-plane centre of the map, where the camera should look by default. */
  get centre(): Vec3 {
    return { x: this.size / 2, y: 0, z: this.size / 2 };
  }

  /**
   * Stands an object on a tile: its pivot (base centre, per the style
   * guide) goes to the tile's ground centre and it joins the group. The
   * caller keeps ownership of the object's resources; `dispose` only
   * detaches it.
   */
  placeOnTile(object: Object3D, tile: GroundTile): void {
    object.position.set(tile.x + 0.5, 0, tile.z + 0.5);
    this.root.add(object);
  }

  /** Releases GPU resources and empties the group. */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.root.clear();
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Builds the checkerboard as two instanced meshes, one per colour.
   *
   * @returns The even and odd tile meshes.
   */
  private buildGround(): InstancedMesh[] {
    const tileCount = this.size * this.size;
    const evenCount = Math.ceil(tileCount / 2);
    const oddCount = tileCount - evenCount;

    const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.disposables.push(geometry);

    const even = this.createTileMesh(geometry, GROUND_EVEN, evenCount);
    const odd = this.createTileMesh(geometry, GROUND_ODD, oddCount);

    const matrix = new Matrix4();
    let evenIndex = 0;
    let oddIndex = 0;
    for (let z = 0; z < this.size; z++) {
      for (let x = 0; x < this.size; x++) {
        matrix.makeTranslation(x + 0.5, 0, z + 0.5);
        if ((x + z) % 2 === 0) {
          even.setMatrixAt(evenIndex, matrix);
          evenIndex += 1;
        } else {
          odd.setMatrixAt(oddIndex, matrix);
          oddIndex += 1;
        }
      }
    }
    even.instanceMatrix.needsUpdate = true;
    odd.instanceMatrix.needsUpdate = true;
    return [even, odd];
  }

  /**
   * Creates one instanced tile mesh with a palette-named material.
   *
   * @returns The mesh, sized for `count` instances.
   */
  private createTileMesh(
    geometry: PlaneGeometry,
    token: PaletteToken,
    count: number,
  ): InstancedMesh {
    const material = this.createMaterial(token);
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.name = `ground-${token.name}`;
    return mesh;
  }

  /**
   * Builds one box per scale reference, standing on its tile.
   *
   * @returns The box meshes.
   */
  private buildScaleReferences(): Mesh[] {
    return SCALE_REFERENCES.map((reference) => {
      const geometry = new BoxGeometry(
        BOX_FOOTPRINT,
        reference.height,
        BOX_FOOTPRINT,
      );
      this.disposables.push(geometry);
      const mesh = new Mesh(geometry, this.createMaterial(reference.material));
      mesh.name = `scale-${reference.id}`;
      mesh.position.set(
        reference.tile.x + 0.5,
        reference.height / 2,
        reference.tile.z + 0.5,
      );
      return mesh;
    });
  }

  /**
   * Creates a flat-shaded material named after its palette token
   * (style guide §6).
   *
   * @returns The material, registered for disposal.
   */
  private createMaterial(token: PaletteToken): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color: token.hex,
      flatShading: true,
      metalness: 0,
      roughness: 0.9,
    });
    material.name = token.name;
    this.disposables.push(material);
    return material;
  }
}
