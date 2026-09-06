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
import { threeSidedTerrace } from "./three-sided-slope-fixture.test-helper";
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

describe("shipped three-sided terrain geometry (#849)", () => {
  const models = shippedModels();
  it("keeps the ground footprint, base pivot and shared one-layer rise", async () => {
    const model = await models.load("tile.slope.three-sided");
    const box = new Box3().setFromObject(model);
    expect(box.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([0.5, LAYER_HEIGHT, 0.5]);
    expect(MODEL_MANIFEST["tile.slope.three-sided"].height).toBe(LAYER_HEIGHT);
    let triangles = 0;
    model.traverse((object) => {
      if (object instanceof Mesh) {
        const geometry = (object as Mesh).geometry;
        triangles +=
          (geometry.index?.count ?? geometry.getAttribute("position").count) /
          3;
      }
    });
    expect(triangles).toBe(14);
  });
  for (const surface of ["grass", "snow"])
    for (const turns of [0, 1, 2, 3] as const)
      it(`${surface}, opening turn ${turns}: the pocket, mouth and unchanged terrace meet`, async () => {
        const map = threeSidedTerrace(turns, surface);
        const placements = resolveMapModels(map).tiles;
        expect(
          placements.filter((p) => p.terrain?.kind === "three-sided"),
        ).toHaveLength(1);
        expect(
          placements.filter((p) => p.terrain?.kind === "three-sided-mouth"),
        ).toHaveLength(1);
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
        /** Samples the visible instanced GLBs, including materialisation and placement. */
        function height(x: number, z: number): number {
          const hit = new Raycaster(
            new Vector3(x, 20, z),
            new Vector3(0, -1, 0),
          ).intersectObjects(meshes)[0];
          expect(hit, `surface at ${x},${z}`).toBeDefined();
          return hit!.point.y;
        }
        // Piece interiors, including the V midpoint, catch a closed but incorrectly
        // triangulated surface. Test the composed mouth as well as the new GLB.
        for (const kind of ["pocket", "mouth"])
          for (const u of [0.01, 0.25, 0.5, 0.75, 0.99])
            for (const v of [0.01, 0.25, 0.5, 0.75, 0.99]) {
              let x = 3 + u,
                z = (kind === "pocket" ? 3 : 2) + v;
              for (let i = 0; i < turns; i++) [x, z] = [map.width - z, x];
              const fraction =
                kind === "pocket"
                  ? Math.max(Math.abs(2 * u - 1), v)
                  : Math.min(Math.abs(2 * u - 1), v);
              expect(height(x, z), `${kind} at ${u},${v}`).toBeCloseTo(
                tileTop(0) + LAYER_HEIGHT * fraction,
                5,
              );
            }
        // Every border in the hand-built neighbourhood, not just the replacement.
        // Flat ground inherits its existing 0.025u lip; all slope joins are tighter.
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
        for (const u of [0.01, 0.25, 0.5, 0.75, 0.99]) {
          let ax = 3 + u,
            az = 3 - epsilon,
            bx = 3 + u,
            bz = 3 + epsilon;
          for (let i = 0; i < turns; i++) {
            [ax, az] = [map.width - az, ax];
            [bx, bz] = [map.width - bz, bx];
          }
          expect(Math.abs(height(ax, az) - height(bx, bz))).toBeLessThan(
            0.0001,
          );
        }
        view.dispose();
      });
  it("shares pocket and mouth materials across elevation batches", async () => {
    const field = threeSidedTerrace();
    const map = {
      ...field,
      width: 16,
      levels: 3,
      tiles: [
        ...field.tiles,
        ...field.tiles.map((t) => ({ ...t, x: t.x + 9, y: t.y + 1 })),
      ],
    };
    const view = new TacticalMapView(map);
    await view.loadModels(models);
    const tops: InstancedMesh[] = [];
    const mouthTops: InstancedMesh[] = [];
    view.root.traverse((object) => {
      if (
        object instanceof InstancedMesh &&
        object.name.startsWith("tiles-model:tile.slope.three-sided:") &&
        object.name.endsWith(":0")
      )
        tops.push(object as InstancedMesh);
      if (
        object instanceof InstancedMesh &&
        object.name.includes(":terrain:grass:three-sided-mouth:") &&
        (object.name.endsWith(":0") || object.name.endsWith(":2"))
      )
        mouthTops.push(object as InstancedMesh);
    });
    expect(tops).toHaveLength(2);
    expect(mouthTops).toHaveLength(4);
    expect(new Set([...tops, ...mouthTops].map((m) => m.material)).size).toBe(
      1,
    );
    view.dispose();
  });
});
