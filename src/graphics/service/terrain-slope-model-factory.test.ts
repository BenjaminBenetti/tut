/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { MODEL_MANIFEST } from "../data/model-manifest";
import { SLOPE_MODELS } from "../data/map-model-table";
import { LEVEL_HEIGHT } from "../data/mapgen-preview-palette";
import { TerrainSlopeModelFactory } from "./terrain-slope-model-factory";

/** Parses the real, texture-neutral GLB, so tests exercise the exported art contract. */
async function prototype(kind: keyof typeof SLOPE_MODELS): Promise<Object3D> {
  const file = new URL(
    `../../../public/${MODEL_MANIFEST[SLOPE_MODELS[kind]].path}`,
    import.meta.url,
  );
  const bytes = readFileSync(file);
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return (await new GLTFLoader().parseAsync(data, "")).scene;
}

describe("terrain slope kit", () => {
  for (const kind of Object.keys(
    SLOPE_MODELS,
  ) as (keyof typeof SLOPE_MODELS)[]) {
    it(`${kind} covers one whole tile, joins at today's layer height, and borrows both ground materials`, async () => {
      const source = await prototype(kind);
      const loader = {
        load: () => Promise.resolve(source.clone(true)),
        preload: () => Promise.resolve(),
      };
      const surface = new MeshStandardMaterial({ color: 0x5e7a3a });
      const sides = new MeshStandardMaterial({ color: 0x5e7a3a });
      const factory = new TerrainSlopeModelFactory(loader);
      const node = await factory.create(kind, {
        surface,
        sides,
        uv: { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 },
      });
      node.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(node);
      expect(bounds.min.toArray()).toEqual([-0.5, 0, -0.5]);
      expect(bounds.max.toArray()).toEqual([0.5, LEVEL_HEIGHT, 0.5]);
      expect(MODEL_MANIFEST[SLOPE_MODELS[kind]].height).toBe(LEVEL_HEIGHT);
      const top = node.getObjectByName("slope-surface") as Mesh;
      const side = node.getObjectByName("slope-sides") as Mesh;
      expect(top.material).toBe(surface);
      expect(side.material).toBe(sides);
      expect(top.geometry.getAttribute("position").count).toBe(6);
      const uv = top.geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0.25);
        expect(uv.getX(i)).toBeLessThanOrEqual(0.5);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0.5);
        expect(uv.getY(i)).toBeLessThanOrEqual(0.75);
      }
      // Sample the full top, including the corner diagonal: no missing triangles
      // or wrong-facing normals. These are the documented height fields #799 maps.
      for (const x of [-0.49, 0, 0.49])
        for (const z of [-0.49, 0, 0.49]) {
          const ray = new Raycaster(
            new Vector3(x, LEVEL_HEIGHT + 1, z),
            new Vector3(0, -1, 0),
          );
          const hit = ray.intersectObject(top)[0];
          const fraction =
            kind === "straight"
              ? z + 0.5
              : kind === "inner"
                ? Math.max(x + 0.5, z + 0.5)
                : Math.min(x + 0.5, z + 0.5);
          expect(hit, `${kind} at ${x},${z}`).toBeDefined();
          expect(hit!.point.y).toBeCloseTo(fraction * LEVEL_HEIGHT);
        }
      // An independent material choice reuses the asset, never recolours its source.
      const sand = new MeshStandardMaterial({ color: 0xd9b87a });
      const other = await factory.create(kind, { surface: sand, sides: sand });
      expect((other.getObjectByName("slope-surface") as Mesh).material).toBe(
        sand,
      );
      expect(top.material).toBe(surface);
      source.traverse((part) => {
        if (part instanceof Mesh) {
          const mesh = part as Mesh;
          expect(mesh.material).not.toBe(surface);
          expect(mesh.material).not.toBe(sand);
          expect(mesh.geometry.getAttribute("uv").getX(0)).toBeLessThanOrEqual(
            1,
          );
        }
      });
      for (const root of [node, other, source])
        root.traverse((part) => {
          if (part instanceof Mesh) (part as Mesh).geometry.dispose();
        });
      surface.dispose();
      sides.dispose();
      sand.dispose();
    });
  }
});
