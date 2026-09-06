import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { Material, Object3D } from "three";

import { DIAGONAL_SLOPE_MODEL, SLOPE_MODELS } from "../data/map-model-table";
import type { ModelLoader } from "../model/model-loader";

// ===========================================
// Materials
// ===========================================

/** Texture region of the existing ground material; ordinary UVs default to the whole map. */
export interface SlopeUvRegion {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Borrowed ground materials. Sides use exactly the adjoining terrace's material. */
export interface SlopeMaterials {
  readonly surface: Material;
  readonly sides: Material;
  readonly uv?: SlopeUvRegion;
}

/**
 * Borrows the broadest upward face's material and UV region from existing
 * ground art. This picks the asphalt deck over small road markings, and
 * the rock slab over its lumps. Cliff material comes from the scene.
 */
export function slopeMaterialsFromGround(
  ground: Object3D,
  sides: Material,
): SlopeMaterials {
  let selected: SlopeMaterials = { surface: sides, sides };
  let largest = 0;
  ground.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const mesh = object as Mesh;
    if (Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const uv = geometry.getAttribute("uv");
    if (!position || !normal || !uv) return;
    const index = geometry.index;
    let area = 0;
    let u0 = Infinity,
      v0 = Infinity,
      u1 = -Infinity,
      v1 = -Infinity;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      if (normal.getY(a) < 0.5) continue;
      area += Math.abs(
        (position.getX(b) - position.getX(a)) *
          (position.getZ(c) - position.getZ(a)) -
          (position.getX(c) - position.getX(a)) *
            (position.getZ(b) - position.getZ(a)),
      );
      for (const vertex of [a, b, c]) {
        u0 = Math.min(u0, uv.getX(vertex));
        v0 = Math.min(v0, uv.getY(vertex));
        u1 = Math.max(u1, uv.getX(vertex));
        v1 = Math.max(v1, uv.getY(vertex));
      }
    }
    if (area > largest) {
      largest = area;
      selected = { surface: mesh.material, sides, uv: { u0, v0, u1, v1 } };
    }
  });
  return selected;
}

// ===========================================
// TerrainSlopeModelFactory
// ===========================================

/**
 * Consumes #798's three registered meshes with the ground material chosen
 * by the scene (#799). No texture variants or embedded atlas in the GLBs.
 * Returns single-material parts suitable for the map's instanced batching.
 * Caller owns the returned geometries; materials and loader prototypes
 * remain borrowed. Cache the result per shape/material in the scene.
 */
export class TerrainSlopeModelFactory {
  /** Uses the scene's model loader, including its preload/cache/fallback policy. */
  constructor(private readonly models: ModelLoader) {}

  /** Builds a base-centred slope; rotate around Y and place at the low tile's surface plane. */
  async create(
    kind: keyof typeof SLOPE_MODELS | "diagonal",
    materials: SlopeMaterials,
  ): Promise<Group> {
    const prototype = await this.models.load(
      kind === "diagonal" ? DIAGONAL_SLOPE_MODEL : SLOPE_MODELS[kind],
    );
    const result = new Group();
    result.name = `terrain-slope-${kind}`;
    prototype.updateMatrixWorld(true);
    prototype.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh;
      const source = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      source.applyMatrix4(object.matrixWorld);
      const position = source.getAttribute("position");
      const normal = source.getAttribute("normal");
      const uv = source.getAttribute("uv");
      const region = materials.uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
      for (const top of [true, false]) {
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        for (let i = 0; i < position.count; i += 3) {
          if (normal.getY(i) > 0.001 !== top) continue;
          for (let j = i; j < i + 3; j++) {
            positions.push(
              position.getX(j),
              position.getY(j),
              position.getZ(j),
            );
            normals.push(normal.getX(j), normal.getY(j), normal.getZ(j));
            uvs.push(
              region.u0 + uv.getX(j) * (region.u1 - region.u0),
              region.v0 + uv.getY(j) * (region.v1 - region.v0),
            );
          }
        }
        if (positions.length === 0) continue;
        const geometry = new BufferGeometry();
        geometry.setAttribute(
          "position",
          new Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
        geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
        const mesh = new Mesh(
          geometry,
          top ? materials.surface : materials.sides,
        );
        mesh.name = top ? "slope-surface" : "slope-sides";
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        result.add(mesh);
      }
      source.dispose();
    });
    return result;
  }
}
