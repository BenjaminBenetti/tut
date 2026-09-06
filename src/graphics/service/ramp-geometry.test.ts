/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  InstancedMesh,
  MeshStandardMaterial,
  Raycaster,
  Texture,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { surfaceModel } from "../data/map-model-table";
import { LAYER_HEIGHT } from "../data/mapgen-preview-palette";
import { TacticalMapView, tileTop } from "../view/tactical-map-view";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import { rampTerrace } from "./ramp-fixture.test-helper";
import { resolveMapModels } from "./map-model-resolver";
import { slopeMaterialsFromGround } from "./terrain-slope-model-factory";

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

describe("shipped ramp connector (#875)", () => {
  const models = shippedModels();
  it("has the low-tile footprint, base pivot and shared one-layer rise", async () => {
    const mesh = await models.load("tile.ramp.connector");
    const box = new Box3().setFromObject(mesh);
    expect(box.min.toArray()).toEqual([-0.5, 0, -0.5]);
    expect(box.max.toArray()).toEqual([0.5, LAYER_HEIGHT, 0.5]);
    expect(MODEL_MANIFEST["tile.ramp.connector"].height).toBe(LAYER_HEIGHT);
  });
  for (const layers of [1, 2] as const)
    for (const surface of ["road", "grass"])
      for (const turns of [0, 1, 2, 3] as const)
        it(`${surface}, ${layers} layer(s), turn ${turns}: reaches both terrace edges and joins adjacent ramps`, async () => {
          const map = rampTerrace(layers, surface, turns),
            index = new TileIndex(map);
          const before = JSON.stringify(map);
          const placements = resolveMapModels(map, index);
          expect(placements.connectors).toHaveLength(3);
          const view = new TacticalMapView(map);
          await view.loadModels(models);
          view.root.updateMatrixWorld(true);
          const ramps: InstancedMesh[] = [],
            floors: InstancedMesh[] = [];
          view.root.traverse((object) => {
            if (!(object instanceof InstancedMesh)) return;
            if (object.name.startsWith("ramps-model:"))
              ramps.push(object as InstancedMesh);
            if (object.name.startsWith("tiles-model:"))
              floors.push(object as InstancedMesh);
          });
          /** Ray through actual materialised and instanced GLBs, not a surrogate wedge. */
          function height(x: number, z: number): number {
            const hit = new Raycaster(
              new Vector3(x, 20, z),
              new Vector3(0, -1, 0),
            ).intersectObjects([...ramps, ...floors])[0];
            expect(hit, `surface at ${x},${z}`).toBeDefined();
            return hit!.point.y;
          }
          /** Rotates a sample by the same physical quarter turn as the whole fixture. */
          function rotatedHeight(x: number, z: number): number {
            for (let i = 0; i < turns; i++) [x, z] = [map.width - z, x];
            return height(x, z);
          }
          for (const x of [2.01, 2.5, 2.99, 3.01, 3.5, 3.99, 4.01, 4.5, 4.99]) {
            for (const v of [0.01, 0.25, 0.5, 0.75, 0.99])
              expect(rotatedHeight(x, 2 + v)).toBeCloseTo(
                tileTop(0) + layers * LAYER_HEIGHT * v,
                5,
              );
            for (const edge of [2, 3])
              expect(
                Math.abs(
                  rotatedHeight(x, edge - 0.00001) -
                    rotatedHeight(x, edge + 0.00001),
                ),
              ).toBeLessThan(0.026); // Existing flat slab lip.
          }
          for (const edge of [3, 4])
            for (const v of [0.01, 0.25, 0.5, 0.75, 0.99])
              expect(
                Math.abs(
                  rotatedHeight(edge - 0.00001, 2 + v) -
                    rotatedHeight(edge + 0.00001, 2 + v),
                ),
              ).toBeLessThan(0.0001);
          const ground = await models.load(surfaceModel(surface)!);
          const sides = new MeshStandardMaterial();
          const surfaceMaterial = slopeMaterialsFromGround(ground, sides)
            .surface as MeshStandardMaterial;
          const tops = ramps.filter((m) => m.name.endsWith(":0"));
          expect(tops).toHaveLength(1);
          expect((tops[0]!.material as MeshStandardMaterial).map).toBe(
            surfaceMaterial.map,
          );
          expect(surfaceMaterial.map).not.toBeNull();
          for (const c of map.connectors) {
            expect(view.root.getObjectByName(c.id)?.visible).toBe(false);
            expect(
              placements.tiles.some(
                (p) => index.keyOf(p.tile) === index.keyOf(c.from),
              ),
            ).toBe(false);
            expect(
              placements.connectors.find((p) => p.ramp?.id === c.id)?.tile,
            ).toEqual(c.to);
          }
          // Mist remains owned by the arrival tile, matching the old connector path.
          view.setVision({
            visible: map.connectors.map((c) => index.keyOf(c.from)),
            explored: [],
            spotted: [],
            lastSeen: {},
          });
          for (const mesh of ramps) {
            const mist = mesh.geometry.getAttribute("unexploredMist");
            expect(mist.getW(0)).toBe(1);
          }
          view.setVision({
            visible: map.connectors.map((c) => index.keyOf(c.to)),
            explored: map.connectors.map((c) => index.keyOf(c.to)),
            spotted: [],
            lastSeen: {},
          });
          for (const mesh of ramps)
            expect(mesh.geometry.getAttribute("unexploredMist").getW(0)).toBe(
              0,
            );
          for (const c of map.connectors)
            expect(view.root.getObjectByName(c.id)?.visible).toBe(false);
          view.setMaxLevel(layers - 1);
          expect(view.root.getObjectByName(`level-${layers}`)?.visible).toBe(
            false,
          );
          expect(JSON.stringify(map)).toBe(before);
          sides.dispose();
          view.dispose();
        });
  it("shares prototype and mist material across different rises and elevation batches", async () => {
    const low = rampTerrace(1),
      high = rampTerrace(2);
    const map = {
      ...low,
      width: 16,
      levels: 3,
      tiles: [...low.tiles, ...high.tiles.map((t) => ({ ...t, x: t.x + 9 }))],
      connectors: [
        ...low.connectors,
        ...high.connectors.map((c) => ({
          ...c,
          id: "high-" + c.id,
          from: { ...c.from, x: c.from.x + 9 },
          to: { ...c.to, x: c.to.x + 9 },
        })),
      ],
    };
    const loads: ModelAssetId[] = [];
    const view = new TacticalMapView(map);
    await view.loadModels({
      ...models,
      load: async (id) => {
        loads.push(id);
        return models.load(id);
      },
    });
    const tops: InstancedMesh[] = [];
    view.root.traverse((o) => {
      if (
        o instanceof InstancedMesh &&
        o.name.startsWith("ramps-model:") &&
        o.name.endsWith(":0")
      )
        tops.push(o as InstancedMesh);
    });
    expect(tops).toHaveLength(2);
    expect(tops.every((m) => m.count === 3)).toBe(true);
    expect(new Set(tops.map((m) => m.material)).size).toBe(1);
    expect(loads.filter((id) => id === "tile.ramp.connector")).toHaveLength(1);
    view.dispose();
  });
  it("borrows dirt for a rural trail even though its tile surface is road", async () => {
    // Long approaches exercise the real carriageway style, including rural dirt.
    const field = rampTerrace(2, "road", 0, 3);
    const map = {
      ...field,
      recipe: {
        ...field.recipe,
        params: { ...field.recipe.params, settlement: "rural" as const },
      },
    };
    expect(
      resolveMapModels(map).connectors.every((p) => p.ramp?.surface === "dirt"),
    ).toBe(true);
    const view = new TacticalMapView(map);
    await view.loadModels(models);
    const ground = await models.load("tile.ground.dirt"),
      sides = new MeshStandardMaterial();
    const texture = (
      slopeMaterialsFromGround(ground, sides).surface as MeshStandardMaterial
    ).map;
    let checked = 0;
    view.root.traverse((o) => {
      if (
        o instanceof InstancedMesh &&
        o.name.startsWith("ramps-model:") &&
        o.name.endsWith(":0")
      ) {
        expect(
          ((o as InstancedMesh).material as MeshStandardMaterial).map,
        ).toBe(texture);
        checked++;
      }
    });
    expect(checked).toBe(1);
    sides.dispose();
    view.dispose();
  });
  for (const directions of [
    [
      [0, -1],
      [0, 1],
    ],
    [
      [0, 1],
      [-1, 0],
    ],
  ])
    it(`keeps a low centre for the shared foot ${JSON.stringify(directions)}`, async () => {
      const builder = new FixtureMapBuilder(3, 3, 3).fillGround(0, "dirt");
      for (const [dx, dz] of directions) {
        const to = { x: 1 + dx!, y: 2, z: 1 + dz! };
        builder.tile(to, "dirt");
        builder.connector("ramp", { x: 1, y: 0, z: 1 }, to);
      }
      const map = builder.build(),
        placements = resolveMapModels(map);
      expect(placements.connectors).toHaveLength(2);
      expect(
        placements.connectors.every(
          (p) => p.scaleZ === 0.5 && !p.ramp!.replacesGround,
        ),
      ).toBe(true);
      expect(
        placements.tiles.some((p) => p.tile.x === 1 && p.tile.z === 1),
      ).toBe(true);
      const view = new TacticalMapView(map);
      await view.loadModels(models);
      view.root.updateMatrixWorld(true);
      const meshes: InstancedMesh[] = [];
      view.root.traverse((o) => {
        if (
          o instanceof InstancedMesh &&
          (o.name.startsWith("ramps-model:") ||
            o.name.startsWith("tiles-model:"))
        )
          meshes.push(o as InstancedMesh);
      });
      const height = (x: number, z: number) =>
        new Raycaster(
          new Vector3(x, 20, z),
          new Vector3(0, -1, 0),
        ).intersectObjects(meshes)[0]!.point.y;
      expect(height(1.5, 1.5)).toBeCloseTo(tileTop(0) + 0.025, 5);
      for (const [dx, dz] of directions)
        for (const f of [0.25, 0.5, 0.75, 0.99])
          expect(height(1.5 + (dx! * f) / 2, 1.5 + (dz! * f) / 2)).toBeCloseTo(
            tileTop(0) + 2 * LAYER_HEIGHT * f,
            5,
          );
      view.dispose();
    });
});
