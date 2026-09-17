/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, Texture, Vector3 } from "three";
import type { Group, BufferGeometry } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { ModelAssetId } from "../../content/data/model-ids";

/** Reads production geometry without a browser image decoder. */
async function load(id: ModelAssetId): Promise<Group> {
  const bytes = readFileSync(`public/${MODEL_MANIFEST[id].path}`);
  const loader = new GLTFLoader().register(() => ({
    name: "hive-test-atlas",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  const { scene } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  scene.updateMatrixWorld(true);
  return scene;
}

describe("authored hive kit clearance", () => {
  it("keeps every floor detail inside one tile and below infantry overlay clearance", async () => {
    for (const kind of ["pool", "scales", "blisters"] as const) {
      const scene = await load(`infestation.resin.${kind}`);
      const bounds = new Box3().setFromObject(scene);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(bounds.max.y + 0.005).toBeLessThan(0.18);
      expect(
        Math.max(
          Math.abs(bounds.min.x),
          bounds.max.x,
          Math.abs(bounds.min.z),
          bounds.max.z,
        ),
      ).toBeLessThan(0.5);
    }
  });

  it("keeps door and window centres open in both bare roots and nursery variants", async () => {
    for (const kind of ["door", "window", "window-nest"] as const) {
      const scene = await load(`infestation.resin.${kind}`);
      scene.scale.y = 1.5 / MODEL_MANIFEST[`infestation.resin.${kind}`].height;
      scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(scene);
      // Both uprights must survive authoring transforms; centred copies of a
      // root would block the aperture despite having a plausible total height.
      expect(bounds.min.x).toBeLessThan(-0.4);
      expect(bounds.max.x).toBeGreaterThan(0.4);
      const point = new Vector3();
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const positions = (
          object as Mesh<BufferGeometry>
        ).geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          point
            .fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld);
          if (point.y > (kind === "door" ? 0.1 : 0.45) && point.y < 1.2)
            expect(Math.abs(point.x), `${kind} aperture`).toBeGreaterThan(0.28);
        }
      });
    }
  });
});
