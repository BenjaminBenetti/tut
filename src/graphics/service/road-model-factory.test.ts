/// <reference types="node" />
import { readFileSync } from "node:fs";
import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  InstancedMesh,
} from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { ROAD_MODELS } from "../data/map-model-table";
import { carriagewayMap } from "../../../tools/art/preview/carriageways-fixture";
import { TacticalMapView } from "../view/tactical-map-view";
import { RoadModelFactory } from "./road-model-factory";

/** Reads all four real Blender modules; unrelated textured models use a neutral slab. */
function loader() {
  const cache = new Map<ModelAssetId, Promise<Object3D>>();
  const ids: readonly ModelAssetId[] = Object.values(ROAD_MODELS);
  const load = async (id: ModelAssetId): Promise<Object3D> => {
    if (!cache.has(id))
      cache.set(
        id,
        (async () => {
          if (!ids.includes(id))
            return new Mesh(
              new BoxGeometry(1, 0.05, 1),
              new MeshStandardMaterial(),
            );
          const bytes = readFileSync(
            new URL(
              `../../../public/${MODEL_MANIFEST[id].path}`,
              import.meta.url,
            ),
          );
          return (
            await new GLTFLoader().parseAsync(
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ),
              "",
            )
          ).scene;
        })(),
      );
    return (await cache.get(id)!).clone(true);
  };
  return {
    load,
    preload: async (ids: readonly ModelAssetId[]) => {
      await Promise.all(ids.map(load));
    },
  };
}

describe("Blender carriageway modules (#840)", () => {
  it("keeps the existing centre-pivot slab contract and the tile triangle budget", async () => {
    const models = loader();
    for (const id of Object.values(ROAD_MODELS)) {
      const source = await models.load(id);
      const box = new Box3().setFromObject(source);
      expect(box.min.x).toBeCloseTo(-0.5);
      expect(box.max.x).toBeCloseTo(0.5);
      expect(box.min.z).toBeCloseTo(-0.5);
      expect(box.max.z).toBeCloseTo(0.5);
      expect(box.min.y).toBeCloseTo(-0.025);
      let triangles = 0;
      source.traverse((object) => {
        if (object instanceof Mesh) {
          const mesh = object as Mesh;
          triangles +=
            (mesh.geometry.index?.count ??
              mesh.geometry.getAttribute("position").count) / 3;
        }
      });
      expect(triangles).toBeLessThanOrEqual(60);
    }
  });

  it("combines a kerb and divider with exactly one slab, while borrowing the chosen surface", async () => {
    const models = loader();
    const surface = new MeshStandardMaterial({ color: 0x674d37 });
    const factory = new RoadModelFactory(models);
    for (const style of ["trail", "streets", "grid"] as const) {
      const road = await factory.create(
        { style, kerbs: [0, 3], line: { turns: 0, offset: 0 } },
        {
          surface,
          sides: surface,
          uv: { u0: 0.25, v0: 0.5, u1: 0.5, v1: 0.75 },
        },
      );
      const slabs = road.children.filter(
        (part) => part.name === "road-surface",
      );
      expect(slabs).toHaveLength(1);
      expect((slabs[0] as Mesh).material).toBe(surface);
      const uv = (slabs[0] as Mesh).geometry.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(0.25);
        expect(uv.getX(i)).toBeLessThanOrEqual(0.5);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(0.5);
        expect(uv.getY(i)).toBeLessThanOrEqual(0.75);
      }
      expect(
        road.children.filter((part) => part.name.startsWith("road-kerb")),
      ).toHaveLength(style === "trail" ? 0 : 2);
      const marks = road.children.filter(
        (part) => part.name === "road-centre-line",
      );
      expect(marks).toHaveLength(style === "trail" ? 0 : 1);
      if (marks[0]) {
        const box = new Box3().setFromObject(marks[0]);
        expect(box.min.z + box.max.z).toBeCloseTo(0);
        expect(box.min.y).toBeCloseTo(0.025);
      }
      for (const part of road.children) (part as Mesh).geometry.dispose();
    }
    surface.dispose();
  });

  it("shares a road surface's mist material across elevations", async () => {
    const base = carriagewayMap({
      id: "cross",
      title: "cross",
      style: "grid",
      width: 4,
      shape: "cross",
    });
    const map = {
      ...base,
      levels: 3,
      tiles: [...base.tiles, ...base.tiles.map((tile) => ({ ...tile, y: 2 }))],
    };
    const view = new TacticalMapView(map);
    await view.loadModels(loader());
    const byLevel = [0, 2].map((level) => {
      let surface: InstancedMesh | undefined;
      view.root.traverse((object) => {
        if (
          object instanceof InstancedMesh &&
          object.name.startsWith(
            `tiles-model:tile.city.road-lane:${level}:road:grid:::`,
          )
        )
          surface = object as InstancedMesh;
      });
      return surface;
    });
    expect(byLevel[0]).toBeDefined();
    expect(byLevel[1]).toBeDefined();
    expect(byLevel[0]!.material).toBe(byLevel[1]!.material);
    view.dispose();
  });
});
