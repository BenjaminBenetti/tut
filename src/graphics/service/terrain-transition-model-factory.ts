import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { ModelLoader } from "../model/model-loader";
import type { TerrainCornerHeights } from "../model/terrain-slope-appearance";
import type { SlopeMaterials } from "./terrain-slope-model-factory";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { TERRAIN_TRANSITION_SOURCE } from "../data/map-model-table";

/** Corner index on a centred footprint: NW, NE, SE, SW. */
function cornerIndex(x: number, z: number): number {
  return z < 0 ? (x < 0 ? 0 : 1) : x < 0 ? 3 : 2;
}

/**
 * Fits the existing ground slab to a diagonal chain's shared corner heights.
 * This is a neighbouring surface transition, not another slope catalogue
 * shape. Geometry is owned by the caller; the scene's materials are borrowed.
 */
export class TerrainTransitionModelFactory {
  /** Borrows the same loader and ground topology as the surrounding terrain. */
  constructor(private readonly models: ModelLoader) {}

  /** Builds a closed cap above the tile's low plane, with a planar atlas projection. */
  async create(
    corners: TerrainCornerHeights,
    materials: SlopeMaterials,
    diagonal: 0 | 1,
  ): Promise<Group> {
    const slab = await this.models.load(TERRAIN_TRANSITION_SOURCE);
    slab.updateMatrixWorld(true);
    let source: BufferGeometry | undefined;
    slab.traverse((object) => {
      if (!(object instanceof Mesh) || source) return;
      const mesh = object as Mesh;
      source = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      source.applyMatrix4(mesh.matrixWorld);
    });
    if (!source) throw new Error("Missing ground slab for terrain transition");
    const geometry: BufferGeometry = source;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const middle = (box.min.y + box.max.y) / 2;
    const occurrences = [0, 0, 0, 0];
    for (let i = 0; i < position.count; i++)
      if (normal.getY(i) > 0.5)
        occurrences[cornerIndex(position.getX(i), position.getZ(i))]!++;
    // Keep the shared top edge aligned with the chain. Its outer half then
    // continues the next tile's plane instead of creating a row of teeth.
    // Only the flat foot cap uses the other split, to avoid a zero-height
    // triangle competing with the original pillar's top face.
    const shared =
      corners[diagonal] === 0 && corners[diagonal + 2] === 0
        ? 1 - diagonal
        : diagonal;
    if (occurrences[shared] !== 2) geometry.rotateY(Math.PI / 2);
    const result = new Group();
    const region = materials.uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
    for (const top of [true, false]) {
      const positions: number[] = [],
        uvs: number[] = [];
      for (let i = 0; i < position.count; i += 3) {
        if (normal.getY(i) > 0.5 !== top) continue;
        for (let j = i; j < i + 3; j++) {
          const x = position.getX(j),
            z = position.getZ(j);
          const height =
            position.getY(j) > middle
              ? corners[cornerIndex(x, z)]! * LAYER_HEIGHT
              : 0;
          positions.push(x, height, z);
          uvs.push(
            region.u0 + (x + 0.5) * (region.u1 - region.u0),
            region.v0 + (z + 0.5) * (region.v1 - region.v0),
          );
        }
      }
      const fitted = new BufferGeometry();
      fitted.setAttribute("position", new Float32BufferAttribute(positions, 3));
      fitted.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
      fitted.computeVertexNormals();
      const mesh = new Mesh(fitted, top ? materials.surface : materials.sides);
      mesh.name = top ? "transition-surface" : "transition-sides";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      result.add(mesh);
    }
    geometry.dispose();
    return result;
  }
}
