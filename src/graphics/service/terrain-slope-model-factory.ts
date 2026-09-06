import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import type { Material } from "three";

import { SLOPE_MODELS } from "../data/map-model-table";
import type { ModelLoader } from "../model/model-loader";

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
    kind: keyof typeof SLOPE_MODELS,
    materials: SlopeMaterials,
  ): Promise<Group> {
    const prototype = await this.models.load(SLOPE_MODELS[kind]);
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
