/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Group, Mesh, Raycaster, Vector3, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import { HIPPED_ROOF_MODEL } from "../data/map-model-table";
import { MODEL_MANIFEST } from "../data/model-manifest";
import type { ModelLoader } from "../model/model-loader";
import { PitchedRoofModelFactory } from "./pitched-roof-model-factory";
import { pitchedRoofKey } from "./pitched-roof-model-resolver";

/** Reads the shipped cap, retaining the production loader's shared materials. */
async function sourceModels(): Promise<{
  source: Object3D;
  models: ModelLoader;
}> {
  const bytes = readFileSync(
    `public/${MODEL_MANIFEST[HIPPED_ROOF_MODEL].path}`,
  );
  const { scene: source } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  return {
    source,
    models: {
      load: (id: ModelAssetId) => {
        expect(id).toBe(HIPPED_ROOF_MODEL);
        return Promise.resolve(source.clone(true));
      },
      preload: () => Promise.resolve(),
    },
  };
}

/** Exact four-sided hip at a point in a rectangular roof footprint. */
function roofHeight(x: number, z: number, w: number, d: number): number {
  return 0.12 + Math.min(x, w - x, z, d - z) * 0.25;
}

describe("hipped roof source and fitting (#1084)", () => {
  for (const [w, d] of [
    [4, 7],
    [5, 8],
    [7, 4],
    [8, 5],
    [5, 5],
  ] as const) {
    it(`${w}×${d}: closes every hip, ridge and tile seam without changing the source`, async () => {
      const { source, models } = await sourceModels();
      const original = source.toJSON();
      const factory = new PitchedRoofModelFactory(models);
      const roof = new Group();
      const materials = new Set();
      for (let z = 0; z < d; z++)
        for (let x = 0; x < w; x++) {
          const width = (u: number): number => 0.12 + Math.min(u, w - u) * 0.25;
          const depth = (u: number): number => 0.12 + Math.min(u, d - u) * 0.25;
          const cap = await factory.create({
            heights: [width(x), width(x + 0.5), width(x + 1)],
            depthHeights: [depth(z), depth(z + 0.5), depth(z + 1)],
          });
          cap.position.set(x + 0.5, 0, z + 0.5);
          cap.traverse((o) => {
            if (o instanceof Mesh) materials.add(o.material);
          });
          roof.add(cap);
        }
      roof.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(roof);
      expect(bounds.min.toArray()).toEqual([0, 0, 0]);
      expect(bounds.max.x).toBe(w);
      expect(bounds.max.z).toBe(d);
      expect(bounds.max.y).toBeCloseTo(0.12 + Math.min(w, d) * 0.125, 6);
      // Interior samples and both sides of each grid seam catch a wrong
      // corner diagonal, an odd ridge flattened off, or an uncovered cap.
      const xs = [
        ...Array.from({ length: w * 4 }, (_, i) => (i + 0.13) / 4),
        ...Array.from({ length: w - 1 }, (_, i) => [
          i + 0.9999,
          i + 1.0001,
        ]).flat(),
      ];
      const zs = [
        ...Array.from({ length: d * 4 }, (_, i) => (i + 0.17) / 4),
        ...Array.from({ length: d - 1 }, (_, i) => [
          i + 0.9999,
          i + 1.0001,
        ]).flat(),
      ];
      for (const z of zs)
        for (const x of xs) {
          const hit = new Raycaster(
            new Vector3(x, 10, z),
            new Vector3(0, -1, 0),
          ).intersectObject(roof)[0];
          expect(hit, `${x},${z}`).toBeDefined();
          expect(hit!.point.y, `${x},${z}`).toBeCloseTo(
            roofHeight(x, z, w, d),
            5,
          );
        }
      expect(materials.size).toBe(1);
      expect(source.toJSON()).toEqual(original);
      roof.traverse((o) => {
        if (o instanceof Mesh) (o as Mesh).geometry.dispose();
      });
    });
  }

  it("keeps the old gabled cache key and separates the hip's second profile", () => {
    const heights = [0.12, 0.245, 0.37] as const;
    expect(pitchedRoofKey({ heights })).toBe("0.12:0.245:0.37");
    expect(pitchedRoofKey({ heights, depthHeights: heights })).not.toBe(
      pitchedRoofKey({ heights }),
    );
    expect(
      pitchedRoofKey({ heights, depthHeights: [0.37, 0.245, 0.12] }),
    ).not.toBe(pitchedRoofKey({ heights, depthHeights: heights }));
  });
});
