/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, InstancedMesh, Mesh, Raycaster, Texture, Vector3 } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { diagonalTerrace } from "./diagonal-slope-fixture.test-helper";
import { resolveMapModels } from "./map-model-resolver";

/** Uses shipped positions, normals and UVs; image decoding is unnecessary for ray tests. */
function shippedModels(): ModelLoader {
  const cache = new Map<ModelAssetId, Promise<Object3D>>();
  const parser = new GLTFLoader().register(() => ({
    name: "geometry-test-texture",
    loadTexture: () => Promise.resolve(new Texture()),
  }));
  /** Shares loaded prototypes exactly as the scene loader does. */
  async function load(id: ModelAssetId): Promise<Object3D> {
    let value = cache.get(id);
    if (!value) {
      const bytes = readFileSync(`public/${MODEL_MANIFEST[id].path}`);
      value = parser
        .parseAsync(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          "",
        )
        .then((gltf) => gltf.scene);
      cache.set(id, value);
    }
    return (await value).clone(true);
  }
  return {
    load,
    preload: async (ids) => {
      await Promise.all(ids.map(load));
    },
  };
}

describe("shipped diagonal terrain geometry (#848)", () => {
  const models = shippedModels();
  it("keeps the authored footprint, low-plane pivot and one-layer rise", async () => {
    const model = await models.load("tile.slope.diagonal");
    const box = new Box3().setFromObject(model);
    expect(box.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([0.5, LAYER_HEIGHT, 0.5]);
    expect(MODEL_MANIFEST["tile.slope.diagonal"].height).toBe(LAYER_HEIGHT);
    let triangles = 0;
    model.traverse((object) => {
      if (object instanceof Mesh) {
        const geometry = (object as Mesh).geometry;
        triangles +=
          (geometry.index?.count ?? geometry.getAttribute("position").count) /
          3;
      }
    });
    expect(triangles).toBe(10);
  });
  for (const length of [2, 3, 4])
    for (const turns of [0, 1, 2, 3] as const)
      it(`${length}-chain, turn ${turns}: a plane with closed flanks and shared mist materials`, async () => {
        const map = diagonalTerrace(length, turns);
        const view = new TacticalMapView(map);
        await view.loadModels(models);
        view.root.updateMatrixWorld(true);
        const meshes: InstancedMesh[] = [];
        view.root.traverse((object) => {
          if (
            object instanceof InstancedMesh &&
            object.name.startsWith("tiles-model:")
          )
            meshes.push(object as InstancedMesh);
        });
        /** Samples the actual instanced surface, including the transition slab GLB. */
        function height(x: number, z: number): number {
          const hit = new Raycaster(
            new Vector3(x, 20, z),
            new Vector3(0, -1, 0),
          ).intersectObjects(meshes)[0];
          expect(hit, `surface at ${x},${z}`).toBeDefined();
          return hit!.point.y;
        }
        const placements = resolveMapModels(map).tiles;
        for (const placement of placements.filter(
          (p) => p.terrain?.kind === "diagonal",
        )) {
          const { x, y, z } = placement.tile;
          const [[dx, dz]] = [
            [
              [-1, 1],
              [-1, -1],
              [1, -1],
              [1, 1],
            ][(placement.terrain as { turns: number }).turns]!,
          ];
          for (const u of [0.01, 0.3, 0.7, 0.99])
            for (const v of [0.01, 0.3, 0.7, 0.99]) {
              const expected =
                tileTop(y) +
                (LAYER_HEIGHT *
                  ((dx! > 0 ? u : 1 - u) + (dz! > 0 ? v : 1 - v))) /
                  2;
              expect(
                height(x + u, z + v),
                `plane ${x},${z} at ${u},${v}`,
              ).toBeCloseTo(expected, 5);
            }
        }
        // Every internal border, including caps against untouched flat/straight tiles.
        // The shipped base-pivot ground slab sits 0.025 u above tileTop in the
        // existing centre-pivot placement. Allow that inherited lip at flat edges;
        // diagonal-plane and slope-to-cap samples below use 0.0001 u.
        // Sampling just inside each face detects holes, winding errors and raised lips.
        const epsilon = 0.00001;
        for (const tile of map.tiles)
          for (const f of [0.01, 0.25, 0.5, 0.75, 0.99]) {
            if (tile.x + 1 < map.width)
              expect(
                Math.abs(
                  height(tile.x + 1 - epsilon, tile.z + f) -
                    height(tile.x + 1 + epsilon, tile.z + f),
                ),
                `east ${tile.x},${tile.z}`,
              ).toBeLessThan(0.026);
            if (tile.z + 1 < map.depth)
              expect(
                Math.abs(
                  height(tile.x + f, tile.z + 1 - epsilon) -
                    height(tile.x + f, tile.z + 1 + epsilon),
                ),
                `south ${tile.x},${tile.z}`,
              ).toBeLessThan(0.026);
          }
        const tops = meshes.filter(
          (m) =>
            m.name.startsWith("tiles-model:tile.slope.diagonal:") &&
            m.name.endsWith(":0"),
        );
        expect(tops).toHaveLength(length);
        expect(new Set(tops.map((m) => m.material)).size).toBe(1);
        view.dispose();
      });
});
