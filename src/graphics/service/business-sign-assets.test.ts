/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, Texture, Vector3 } from "three";
import type { BufferGeometry, Group, Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { MODEL_IDS } from "../../content/data/model-ids";
import { MODEL_MANIFEST } from "../data/model-manifest";

const SIGNS = MODEL_IDS.filter(
  (id) =>
    id.startsWith("building.business-") ||
    (id.startsWith("building.installation-") && id.endsWith("-entry")),
);
const EPSILON = 0.00001;

/** Only bitmap decoding needs a browser; retain the shipped mesh, UVs and transforms. */
async function loadGeometry(bytes: Uint8Array): Promise<Group> {
  const loader = new GLTFLoader().register(() => ({
    name: "sign-geometry-image-decoder",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  const gltf = await loader.parseAsync(Uint8Array.from(bytes).buffer, "");
  return gltf.scene;
}

describe.each(SIGNS)("business sign %s", (id) => {
  let bytes: Buffer;
  let scene: Group;
  beforeAll(async () => {
    bytes = readFileSync(
      new URL(`../../../public/${MODEL_MANIFEST[id].path}`, import.meta.url),
    );
    scene = await loadGeometry(bytes);
    scene.updateMatrixWorld(true);
  });

  it("fits the facade width and mounting envelope without sealing the door plane", () => {
    const width = id.endsWith("-compact") ? 1 : 3;
    const bounds = new Box3().setFromObject(scene);
    expect(bounds.min.x).toBeGreaterThanOrEqual(-width / 2 - EPSILON);
    expect(bounds.max.x).toBeLessThanOrEqual(width / 2 + EPSILON);
    expect(bounds.min.z).toBeGreaterThanOrEqual(-EPSILON);
    expect(bounds.max.z).toBeLessThanOrEqual(0.72 + EPSILON);
    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeLessThanOrEqual(0.4 + EPSILON);
    const point = new Vector3();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      const positions = mesh.geometry.getAttribute("position");
      for (let i = 0; i < positions.count; i++) {
        point
          .fromBufferAttribute(positions, i)
          .applyMatrix4(object.matrixWorld);
        if (point.z < 0.12)
          expect(point.y).toBeGreaterThanOrEqual(0.12 - EPSILON);
      }
    });
  });

  it("ships readable embedded print with real UVs inside the building-module budget", () => {
    expect(bytes.length).toBeLessThanOrEqual(100 * 1024);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(
      bytes.subarray(20, 20 + jsonLength).toString("utf8"),
    ) as {
      images?: { bufferView?: number; mimeType?: string }[];
      bufferViews: { byteOffset?: number; byteLength: number }[];
    };
    expect(json.images?.length).toBeGreaterThan(0);
    const binaryStart = 20 + jsonLength + 8;
    for (const image of json.images ?? []) {
      expect(image.mimeType).toBe("image/png");
      expect(image.bufferView).toBeDefined();
      const view = json.bufferViews[image.bufferView!]!;
      const start = binaryStart + (view.byteOffset ?? 0);
      const png = bytes.subarray(start, start + view.byteLength);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(128);
      expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(64);
      expect(png.readUInt32BE(16)).toBeLessThanOrEqual(1024);
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(1024);
    }
    let triangles = 0;
    let texturedTriangles = 0;
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
      const geometry = mesh.geometry;
      const count =
        (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
      triangles += count;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      if (materials.some((material) => "map" in material && material.map)) {
        expect(geometry.getAttribute("uv")).toBeDefined();
        texturedTriangles += count;
      }
    });
    expect(triangles).toBeLessThanOrEqual(800);
    expect(texturedTriangles).toBeGreaterThan(0);
  });
});
