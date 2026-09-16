import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { ModelLoader } from "../model/model-loader";
import { TacticalMapView } from "../view/tactical-map-view";
import { InteriorFloorModelFactory } from "./interior-floor-model-factory";
import { resolveInteriorFloors } from "./interior-floor-resolver";
import { resolveMapModels } from "./map-model-resolver";

/** Adjacent office and kitchen, with a roof and one stair that must keep their own materials. */
function interior(): TacticalMap {
  const builder = new FixtureMapBuilder(6, 4, 3).fillGround();
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 6; x++) {
      builder.tile({ x, y: 0, z }, "floor", { buildingId: "b" });
      builder.tile({ x, y: 2, z }, "roof", { buildingId: "b" });
    }
  builder.tile({ x: 0, y: 0, z: 0 }, "stairs", { buildingId: "b" });
  builder.building({
    id: "b",
    kind: "tower",
    groundLevel: 0,
    footprint: [{ x: 0, z: 0, w: 6, d: 4 }],
    floors: [
      {
        index: 0,
        y: 0,
        rooms: [
          {
            id: "office",
            floorIndex: 0,
            kind: "office",
            rect: { x: 0, z: 0, w: 3, d: 4 },
          },
          {
            id: "kitchen",
            floorIndex: 0,
            kind: "kitchen",
            rect: { x: 3, z: 0, w: 3, d: 4 },
          },
        ],
      },
    ],
    entrances: [{ tile: { x: 0, y: 0, z: 1 }, side: "w" }],
    roof: { kind: "flat", walkable: true },
    connectorIds: [],
  });
  return builder.build();
}

/** Shares source resources like the GLTF cache, with a fresh object for each caller. */
function loader(): {
  models: ModelLoader;
  source: Mesh<BoxGeometry, MeshStandardMaterial>;
} {
  const source = new Mesh(
    new BoxGeometry(1, 0.05, 1),
    new MeshStandardMaterial({ color: 0x8e8a82 }),
  );
  return {
    source,
    models: {
      load: () => {
        const group = new Group();
        group.add(source.clone());
        return Promise.resolve(group);
      },
      preload: () => Promise.resolve(),
    },
  };
}

describe("interior room floors", () => {
  it("keeps a room coherent, distinguishes its use and leaves roofs/stairs unchanged", () => {
    const map = interior();
    const before = JSON.stringify(map);
    const index = new TileIndex(map);
    const finishes = resolveInteriorFloors(map, index);
    expect(finishes.size).toBe(23);
    const office = finishes.get(index.keyOf({ x: 1, y: 0, z: 1 }));
    expect(office?.finish).toBe("carpet");
    expect(finishes.get(index.keyOf({ x: 2, y: 0, z: 3 }))).toEqual(office);
    expect(finishes.get(index.keyOf({ x: 4, y: 0, z: 1 }))?.finish).toBe(
      "ceramic",
    );
    const placements = resolveMapModels(map);
    expect(placements.tiles.filter((p) => p.interiorFloor)).toHaveLength(23);
    expect(
      placements.tiles
        .filter((p) => p.level === 2)
        .every((p) => !p.interiorFloor),
    ).toBe(true);
    expect(resolveInteriorFloors(map, index)).toEqual(finishes);
    expect(JSON.stringify(map)).toBe(before);
  });

  it("retextures a private copy without changing the slab bounds or cached source", async () => {
    const { models, source } = loader();
    const sourceUvs = [...source.geometry.getAttribute("uv").array];
    const factory = new InteriorFloorModelFactory(models);
    const floor = await factory.create({ finish: "timber", variant: 0 });
    const meshes: Mesh[] = [];
    floor.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object as Mesh);
    });
    const mesh = meshes[0]!;
    expect(mesh.geometry).not.toBe(source.geometry);
    expect(mesh.material).not.toBe(source.material);
    expect(new Box3().setFromObject(floor).getSize(new Vector3())).toEqual(
      new Box3().setFromObject(source).getSize(new Vector3()),
    );
    expect([...source.geometry.getAttribute("uv").array]).toEqual(sourceUvs);
    expect(source.material.map).toBeNull();
    expect((mesh.material as MeshStandardMaterial).map?.name).toBe(
      "interior-floor-timber:0",
    );
  });

  it("uses separate instanced room finishes and disposes their textures with the view", async () => {
    const { models } = loader();
    const view = new TacticalMapView(interior());
    await view.loadModels(models);
    const textures = new Set<MeshStandardMaterial["map"]>();
    view.root.traverse((object) => {
      if (
        !(object instanceof InstancedMesh) ||
        !object.name.startsWith("tiles-model:") ||
        !object.name.includes(":floor:")
      )
        return;
      const material = (object as Mesh).material as MeshStandardMaterial;
      textures.add(material.map);
    });
    expect(textures.size).toBe(2);
    const disposed = vi.fn();
    for (const texture of textures)
      texture?.addEventListener("dispose", disposed);
    view.dispose();
    expect(disposed).toHaveBeenCalledTimes(2);
  });
});
