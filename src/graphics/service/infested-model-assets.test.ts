/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, MeshPhysicalMaterial, Texture, Vector3 } from "three";
import type { BufferGeometry, Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { INFESTED_MODEL_VARIANTS } from "../data/infested-model-variants";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { ModelAssetId } from "../../content/data/model-ids";

/** Load the shipped meshes and physical material properties without browser textures. */
async function load(id: ModelAssetId) {
  const bytes = readFileSync(`public/${MODEL_MANIFEST[id].path}`);
  const loader = new GLTFLoader().register(() => ({
    name: "host-test-atlas",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  const { scene } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.updateMatrixWorld(true);
  return scene;
}

describe("shipped infested host geometry", () => {
  it("keeps base pivots, footprints, sockets and masonry height, and exports wet materials", async () => {
    for (const [base, stages] of Object.entries(INFESTED_MODEL_VARIANTS)) {
      const original = MODEL_MANIFEST[base as ModelAssetId];
      for (const id of stages) {
        const entry = MODEL_MANIFEST[id];
        expect(entry.footprint, id).toEqual(original.footprint);
        expect(entry.sockets, id).toEqual(original.sockets);
        const scene = await load(id);
        const bounds = new Box3().setFromObject(scene);
        expect(bounds.min.y, id).toBeGreaterThanOrEqual(-0.002);
        if (base.startsWith("building.wall")) {
          expect(bounds.max.y, id).toBeLessThanOrEqual(original.height + 0.002);
          expect(
            Math.max(Math.abs(bounds.min.x), bounds.max.x),
            id,
          ).toBeLessThan(0.55);
        }
        let wet = false;
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const mat of materials)
            if (mat.name === "resin-wet") {
              expect(mat).toBeInstanceOf(MeshPhysicalMaterial);
              const physical = mat as MeshPhysicalMaterial;
              expect(physical.roughness).toBeLessThan(0.25);
              expect(physical.clearcoat).toBeGreaterThan(0.8);
              wet = true;
            }
        });
        expect(wet, id).toBe(true);
      }
    }
  });

  it("never grows tissue across doorways or the usable glass area", async () => {
    for (const [base, stages] of Object.entries(INFESTED_MODEL_VARIANTS)) {
      if (!/wall-(door|window)/.test(base)) continue;
      for (const id of stages) {
        const scene = await load(id);
        const point = new Vector3();
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          if (!materials.some((material) => material.name.startsWith("resin-")))
            return;
          const positions = mesh.geometry.getAttribute("position");
          for (let i = 0; i < positions.count; i++) {
            point
              .fromBufferAttribute(positions, i)
              .applyMatrix4(object.matrixWorld);
            const low = base.includes("door") ? 0.1 : 0.57;
            const high = base.includes("door") ? 1.18 : 1.05;
            if (point.y > low && point.y < high)
              expect(Math.abs(point.x), id).toBeGreaterThan(0.28);
          }
        });
      }
    }
  });
});
