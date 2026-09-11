import type { Object3D } from "three";
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { HookKinds } from "../../mapgen/model/hook";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { Building } from "../../mapgen/model/building";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  CONNECTOR_COLOURS,
  LAYER_HEIGHT,
  SLAB_HEIGHT,
} from "../data/mapgen-preview-palette";
import type { ModelLoader } from "../model/model-loader";
import { createGhostUniforms } from "../service/ghost-cutaway";
import {
  TacticalMapView,
  VISION_DIM,
  VISION_UNEXPLORED,
} from "./tactical-map-view";

/**
 * 4×3, two levels: grass ground, a road, a ledge at level 1 with a ramp,
 * a floor tile with a door, a crate, one deploy tile and one objective.
 */
function fixture(): FixtureMapBuilder {
  const b = new FixtureMapBuilder(4, 3, 2).fillGround();
  b.tile({ x: 1, y: 0, z: 0 }, SurfaceIds.ROAD);
  b.tile({ x: 3, y: 1, z: 1 }, SurfaceIds.ROCK);
  b.connector("ramp", { x: 2, y: 0, z: 1 }, { x: 3, y: 1, z: 1 });
  b.tile({ x: 0, y: 1, z: 2 }, SurfaceIds.FLOOR, {
    buildingId: "b",
    floorIndex: 0,
  });
  b.wall({ x: 0, y: 1, z: 2 }, "n", "door");
  b.wall({ x: 0, y: 1, z: 2 }, "e", "solid");
  b.prop(PropKindIds.CRATE, { x: 2, y: 0, z: 2 });
  b.deploy([{ x: 0, y: 0, z: 0 }]);
  b.objective(HookKinds.EGG_SPAWNER, [{ x: 3, y: 0, z: 2 }]);
  return b;
}

function meshesIn(view: TacticalMapView, level: number): InstancedMesh[] {
  const group = view.root.getObjectByName(`level-${level}`);
  return (group?.children ?? []).filter(
    (child): child is InstancedMesh => "isInstancedMesh" in child,
  );
}

describe("TacticalMapView", () => {
  it("keeps water's outer shell without internal faces across its continuous surface", () => {
    const map = new FixtureMapBuilder(3, 3, 1)
      .fillGround(0, SurfaceIds.WATER)
      .build();
    const view = new TacticalMapView(map);
    const water = named(view, "tiles-ground:tile:water:");
    for (const mesh of water) {
      (mesh.material as MeshStandardMaterial).side = DoubleSide;
    }
    view.root.updateMatrixWorld(true);
    const origin = new Vector3(1.5, SLAB_HEIGHT / 2, 1.5);
    const boundaries = [
      [new Vector3(1, 0, 0), new Vector3(3, origin.y, 1.5)],
      [new Vector3(-1, 0, 0), new Vector3(0, origin.y, 1.5)],
      [new Vector3(0, 0, 1), new Vector3(1.5, origin.y, 3)],
      [new Vector3(0, 0, -1), new Vector3(1.5, origin.y, 0)],
      [new Vector3(0, 1, 0), new Vector3(1.5, SLAB_HEIGHT, 1.5)],
      [new Vector3(0, -1, 0), new Vector3(1.5, 0, 1.5)],
    ] as const;
    for (const [direction, boundary] of boundaries) {
      const hits = new Raycaster(origin, direction).intersectObjects(water);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]!.point.distanceTo(boundary)).toBeLessThan(1e-6);
    }
    view.dispose();
  });

  it.each([
    { neighbour: "shore", surface: SurfaceIds.SAND, level: 0 },
    { neighbour: "higher water", surface: SurfaceIds.WATER, level: 1 },
  ])("retains the water side against $neighbour", ({ surface, level }) => {
    const builder = new FixtureMapBuilder(2, 1, 2);
    builder.tile({ x: 0, y: 0, z: 0 }, SurfaceIds.WATER);
    builder.tile({ x: 1, y: level, z: 0 }, surface);
    const view = new TacticalMapView(builder.build());
    const water = named(view, "tiles-ground:tile:water:0");
    for (const mesh of water) {
      (mesh.material as MeshStandardMaterial).side = DoubleSide;
    }
    view.root.updateMatrixWorld(true);
    const hits = new Raycaster(
      new Vector3(0.5, SLAB_HEIGHT / 2, 0.5),
      new Vector3(1, 0, 0),
    ).intersectObjects(water);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.point.x).toBeCloseTo(1, 6);
    view.dispose();
  });

  it("groups everything by level and centres on the map", () => {
    const view = new TacticalMapView(fixture().build());
    expect(view.levels).toEqual([0, 1]);
    expect(view.centre).toEqual({ x: 2, y: 0, z: 1.5 });
    expect(view.root.children.map((c) => c.name).sort()).toEqual([
      "level-0",
      "level-1",
    ]);
    view.dispose();
  });

  it("batches tiles per surface, walls per kind, props per cover and hooks per kind", () => {
    const view = new TacticalMapView(fixture().build());
    const names0 = meshesIn(view, 0).map((m) => m.name);
    expect(names0).toContain("tiles-ground:tile:grass:0");
    expect(names0).toContain("tiles-ground:tile:road:0");
    expect(names0).toContain("props:prop:1:0");
    expect(names0).toContain("hooks:hook:deploy:0");
    expect(names0).toContain("hooks:hook:egg-spawner:0");
    const grass = meshesIn(view, 0).find(
      (m) => m.name === "tiles-ground:tile:grass:0",
    );
    expect(grass?.count).toBe(11);

    const names1 = meshesIn(view, 1).map((m) => m.name);
    expect(names1).toContain("tiles-ground:tile:rock:1");
    expect(names1).toContain("tiles-slab:tile:floor:1");
    expect(names1).toContain("walls:wall:door:1");
    expect(names1).toContain("walls:wall:solid:1");
    expect(view.root.getObjectByName("c1")).toBeDefined();
    view.dispose();
  });

  it("stands ground pillars on the ground plane and slabs on their level", () => {
    const view = new TacticalMapView(fixture().build());
    const rock = meshesIn(view, 1).find(
      (m) => m.name === "tiles-ground:tile:rock:1",
    );
    const floor = meshesIn(view, 1).find(
      (m) => m.name === "tiles-slab:tile:floor:1",
    );
    expect(rock).toBeDefined();
    expect(floor).toBeDefined();
    if (rock === undefined || floor === undefined) return;
    const top = LAYER_HEIGHT + SLAB_HEIGHT;
    const rockScale = rock.instanceMatrix.array[5];
    const floorScale = floor.instanceMatrix.array[5];
    expect(rockScale).toBeCloseTo(top);
    expect(floorScale).toBeCloseTo(SLAB_HEIGHT);
    view.dispose();
  });

  it("peels levels with setMaxLevel", () => {
    const view = new TacticalMapView(fixture().build());
    view.setMaxLevel(0);
    expect(view.root.getObjectByName("level-0")?.visible).toBe(true);
    expect(view.root.getObjectByName("level-1")?.visible).toBe(false);
    view.setMaxLevel(undefined);
    expect(view.root.getObjectByName("level-1")?.visible).toBe(true);
    view.dispose();
  });

  it("colours unknown surfaces and hook kinds with the fallbacks instead of throwing", () => {
    const map = new FixtureMapBuilder(1, 1, 1)
      .tile({ x: 0, y: 0, z: 0 }, "lava")
      .objective("hive-core", [{ x: 0, y: 0, z: 0 }])
      .build();
    const view = new TacticalMapView(map);
    expect(meshesIn(view, 0).map((m) => m.name)).toContain(
      "tiles-ground:tile:lava:0",
    );
    expect(meshesIn(view, 0).map((m) => m.name)).toContain(
      "hooks:hook:hive-core:0",
    );
    view.dispose();
  });
});

// ===========================================
// Tile picking (#340)
// ===========================================

describe("TacticalMapView.pickTile", () => {
  /** A top-down orthographic camera over the 4×3 fixture. */
  function topDown(): OrthographicCamera {
    const camera = new OrthographicCamera(0, 4, 0, -3, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }
  const ndcOf = (camera: OrthographicCamera, x: number, z: number) => {
    const v = new Vector3(x, 0, z).project(camera);
    return { x: v.x, y: v.y };
  };

  it("finds the ground tile under a ray and the ledge on its own level", () => {
    const view = new TacticalMapView(fixture().build());
    const camera = topDown();
    expect(view.pickTile(ndcOf(camera, 1.5, 0.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
    expect(view.pickTile(ndcOf(camera, 3.5, 1.5), camera)).toEqual({
      x: 3,
      y: 1,
      z: 1,
    });
    expect(view.pickTile(ndcOf(camera, 0.5, 2.5), camera)).toEqual({
      x: 0,
      y: 1,
      z: 2,
    });
  });

  it("misses off the map and reports tile centres", () => {
    const view = new TacticalMapView(fixture().build());
    const camera = topDown();
    expect(view.pickTile({ x: 2, y: 2 }, camera)).toBeUndefined();
    expect(view.tileWorldPosition({ x: 1, y: 0, z: 0 })).toEqual({
      x: 1.5,
      y: SLAB_HEIGHT,
      z: 0.5,
    });
    expect(view.tileWorldPosition({ x: 9, y: 0, z: 9 })).toBeUndefined();
  });

  it("still finds a tile once the models have replaced the boxes (#474)", async () => {
    const view = new TacticalMapView(fixture().build());
    await view.loadModels(new FakeModelLoader());
    const camera = topDown();
    expect(view.pickTile(ndcOf(camera, 1.5, 0.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
    expect(view.pickTile(ndcOf(camera, 0.5, 2.5), camera)).toEqual({
      x: 0,
      y: 1,
      z: 2,
    });
    view.dispose();
  });

  it("ignores hidden levels", () => {
    const view = new TacticalMapView(fixture().build());
    view.setMaxLevel(0);
    const camera = topDown();
    expect(view.pickTile(ndcOf(camera, 3.5, 1.5), camera)).toEqual({
      x: 3,
      y: 0,
      z: 1,
    });
  });

  it("picks a highlighted floor through roof geometry, nearest highlighted storey first", () => {
    const floor = { x: 1, y: 0, z: 1 };
    const roof = { x: 1, y: 2, z: 1 };
    const map = new FixtureMapBuilder(4, 3, 3)
      .fillGround()
      .tile(roof, SurfaceIds.ROOF)
      .build();
    const view = new TacticalMapView(map);
    const camera = topDown();
    const pointer = ndcOf(camera, 1.5, 1.5);
    expect(view.pickTile(pointer, camera)).toEqual(roof);
    expect(view.pickTile(pointer, camera, [floor])).toEqual(floor);
    expect(view.pickTile(pointer, camera, [floor, roof])).toEqual(roof);
    view.setMaxLevel(0);
    expect(view.pickTile(pointer, camera, [roof, floor])).toEqual(floor);
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(view.pickTile(pointer, camera)).toBeUndefined();
    expect(view.pickTile(pointer, camera, [floor])).toEqual(floor);
    expect(
      view.pickTile(ndcOf(camera, 2.5, 1.5), camera, [floor]),
    ).toBeUndefined();
    view.dispose();
  });

  it("ignores retired geometry inside a visible level group", () => {
    const view = new TacticalMapView(fixture().build());
    const retired = new Mesh(
      new BoxGeometry(4, 0.1, 3),
      new MeshStandardMaterial(),
    );
    retired.position.set(2, 2, 1.5);
    retired.visible = false;
    view.root.getObjectByName("level-1")!.add(retired);
    const camera = topDown();
    expect(view.pickTile(ndcOf(camera, 1.5, 0.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
    retired.geometry.dispose();
    retired.material.dispose();
    view.dispose();
  });
});

// ===========================================
// Models (#474)
// ===========================================

/** Loads a two-part model per id — a body and a detail — and counts fetches. */
class FakeModelLoader implements ModelLoader {
  readonly loaded: ModelAssetId[] = [];
  readonly preloaded: ModelAssetId[][] = [];

  load(id: ModelAssetId): Promise<Object3D> {
    this.loaded.push(id);
    const root = new Group();
    const body = new Mesh(
      new BoxGeometry(1, 0.05, 1),
      new MeshStandardMaterial(),
    );
    body.name = `body:${id}`;
    const detail = new Mesh(
      new BoxGeometry(0.2, 0.2, 0.2),
      new MeshStandardMaterial(),
    );
    detail.name = `detail:${id}`;
    // Offset from the pivot, so the test can prove the local transform
    // is baked into every instance rather than dropped.
    detail.position.set(0.25, 0.5, 0);
    root.add(body, detail);
    return Promise.resolve(root);
  }

  preload(ids: readonly ModelAssetId[]): Promise<void> {
    this.preloaded.push([...ids]);
    return Promise.resolve();
  }
}

/** Every instanced mesh under the view, at any level. */
function allInstanced(view: TacticalMapView): InstancedMesh[] {
  const found: InstancedMesh[] = [];
  view.root.traverse((child) => {
    if ("isInstancedMesh" in child) {
      found.push(child as InstancedMesh);
    }
  });
  return found;
}

/** Instanced meshes whose name starts with a prefix. */
function named(view: TacticalMapView, prefix: string): InstancedMesh[] {
  return allInstanced(view).filter((m) => m.name.startsWith(prefix));
}

describe("TacticalMapView.loadModels", () => {
  it("centres a two-tile car and reveals its entire hull when only the trailing tile is known", async () => {
    const anchor = { x: 1, y: 0, z: 1 };
    const tail = { x: 2, y: 0, z: 1 };
    const map = new FixtureMapBuilder(5, 3, 1)
      .fillGround(0, "road")
      .prop("car", anchor, 0, [anchor, tail])
      .build();
    const index = new TileIndex(map);
    const view = new TacticalMapView(map);
    const placeholder = named(view, "props:prop:")[0]!;
    const matrix = new Matrix4();
    placeholder.getMatrixAt(0, matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(2);
    expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(1.6);
    view.setVision({
      visible: [index.keyOf(tail)],
      explored: [index.keyOf(tail)],
      spotted: [],
      lastSeen: {},
    });
    await view.loadModels(new FakeModelLoader());
    const cars = named(view, "props-model:prop.car-");
    expect(cars.length).toBeGreaterThan(0);
    for (const car of cars) {
      const colour = new Color();
      car.getColorAt(0, colour);
      expect(colour.toArray()).toEqual([1, 1, 1]);
      expect(car.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    }
    view.setVision({
      visible: [],
      explored: [index.keyOf(tail)],
      spotted: [],
      lastSeen: {},
    });
    for (const car of cars) {
      const colour = new Color();
      car.getColorAt(0, colour);
      expect(colour.r).toBeLessThan(1);
      expect(car.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    }
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    for (const car of cars)
      expect(car.geometry.getAttribute("unexploredMist").getW(0)).toBe(1);
    view.setVision(undefined);
    for (const car of cars)
      expect(car.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    view.dispose();
  });
  it("replaces slope placeholders, batches by surface, and shares mist materials across levels", async () => {
    const base = new FixtureMapBuilder(3, 1, 2).fillGround().build();
    const map: TacticalMap = {
      ...base,
      tiles: base.tiles.map((tile) => ({
        ...tile,
        y: tile.x === 1 ? 1 : 0,
        surface: tile.x === 2 ? SurfaceIds.SAND : SurfaceIds.GRASS,
        slope: { kind: "inner", turns: 0 },
      })),
    };
    const view = new TacticalMapView(map);
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    const models = new FakeModelLoader();
    await view.loadModels(models);
    // Two parts per batch, including the same shape in two materials on level 0.
    const grass = named(view, "tiles-model:tile.slope.inner:").filter((mesh) =>
      mesh.name.includes(":grass:"),
    );
    const sand = named(view, "tiles-model:tile.slope.inner:").filter((mesh) =>
      mesh.name.includes(":sand:"),
    );
    expect(grass).toHaveLength(8); // fake GLB has two meshes, each split into two parts
    expect(sand).toHaveLength(4);
    expect(grass[0]!.material).toBe(grass[4]!.material);
    expect(grass[0]!.material).not.toBe(sand[0]!.material);
    expect(
      models.loaded.filter((id) => id === "tile.slope.inner"),
    ).toHaveLength(2);
    for (const mesh of [...grass, ...sand])
      expect(mesh.geometry.getAttribute("unexploredMist").getW(0)).toBe(1);
    const index = new TileIndex(map);
    view.setVision({
      visible: map.tiles.map((tile) => index.keyOf(tile)),
      explored: [],
      spotted: [],
      lastSeen: {},
    });
    for (const mesh of [...grass, ...sand])
      expect(mesh.geometry.getAttribute("unexploredMist").getW(0)).toBe(0);
    for (const tile of map.tiles)
      expect(
        view.root.getObjectByName(`slope:${tile.x},${tile.z}`)!.visible,
      ).toBe(false);
    view.dispose();
  });

  it("shares a prototype's ghosted mist material across levels, isolated from plain terrain and other scenes", async () => {
    const b = new FixtureMapBuilder(2, 1, 2).fillGround();
    b.tile({ x: 0, y: 1, z: 0 }, SurfaceIds.FLOOR, { buildingId: "b" });
    b.wall({ x: 0, y: 0, z: 0 }, "n", "solid");
    b.wall({ x: 0, y: 1, z: 0 }, "n", "solid");
    const prototype = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    // Loader clones share the source material/geometry, as the GLTF loader does.
    const models: ModelLoader = {
      preload: () => Promise.resolve(),
      load: () => Promise.resolve(prototype.clone()),
    };
    const view = new TacticalMapView(b.build(), createGhostUniforms(2, 0.15));
    const other = new TacticalMapView(b.build(), createGhostUniforms(3, 0.2));
    await view.loadModels(models);
    await other.loadModels(models);
    const walls = named(view, "walls-model:");
    expect(walls).toHaveLength(2);
    expect(walls[0]!.material).toBe(walls[1]!.material);
    expect(walls[0]!.material).not.toBe(
      named(view, "tiles-model:tile.ground")[0]!.material,
    );
    expect(walls[0]!.material).not.toBe(
      named(other, "walls-model:")[0]!.material,
    );
    expect(prototype.material.name).not.toContain("ghosted");
    view.dispose();
    other.dispose();
    prototype.material.dispose();
    prototype.geometry.dispose();
  });

  it("mists walls, props, connectors and late-loaded models by their owning tile", async () => {
    const map = fixture().build();
    const view = new TacticalMapView(map);
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    await view.loadModels(new FakeModelLoader());
    const surfaces: Mesh[] = [];
    view.root.traverse((object) => {
      if (
        object instanceof Mesh &&
        (object.name.includes("-model:") || object.name === "c1")
      ) {
        surfaces.push(object as Mesh);
      }
    });
    expect(surfaces.some((mesh) => mesh.name.startsWith("walls-model:"))).toBe(
      true,
    );
    expect(surfaces.some((mesh) => mesh.name.startsWith("props-model:"))).toBe(
      true,
    );
    expect(surfaces.some((mesh) => mesh.name === "c1")).toBe(true);
    for (const mesh of surfaces) {
      const coverage = mesh.geometry.getAttribute("unexploredMist");
      expect(coverage, mesh.name).toBeDefined();
      for (let i = 0; i < coverage.count; i++) expect(coverage.getW(i)).toBe(1);
    }
    const index = new TileIndex(map);
    view.setVision({
      visible: [],
      explored: map.tiles.map((tile) => index.keyOf(tile)),
      spotted: [],
      lastSeen: {},
    });
    for (const mesh of surfaces) {
      const coverage = mesh.geometry.getAttribute("unexploredMist");
      for (let i = 0; i < coverage.count; i++) expect(coverage.getW(i)).toBe(0);
    }
    view.dispose();
  });

  it("draws the registered art and retires the placeholder boxes it replaces", async () => {
    const view = new TacticalMapView(fixture().build());
    const models = new FakeModelLoader();
    await view.loadModels(models);

    // Tiles, walls and props are now models...
    expect(named(view, "tiles-model:").length).toBeGreaterThan(0);
    expect(named(view, "walls-model:").length).toBeGreaterThan(0);
    expect(named(view, "props-model:").length).toBeGreaterThan(0);
    // ...and the placeholder boxes they replace one for one are off.
    for (const label of ["tiles-slab:", "walls:", "props:"]) {
      const boxes = named(view, label);
      expect(boxes.length, label).toBeGreaterThan(0);
      expect(
        boxes.every((m) => !m.visible),
        label,
      ).toBe(true);
    }
    view.dispose();
  });

  it("keeps the ground pillars, which are the earth under a slab and not a stand-in for it", async () => {
    // Hiding them would leave the fixture's level-1 rock ledge floating
    // over a hole where the ground used to be.
    const view = new TacticalMapView(fixture().build());
    await view.loadModels(new FakeModelLoader());
    const pillars = named(view, "tiles-ground:");
    expect(pillars.length).toBeGreaterThan(0);
    expect(pillars.every((m) => m.visible)).toBe(true);
    view.dispose();
  });

  it("keeps the hook markers and retires the ramp placeholder", async () => {
    const view = new TacticalMapView(fixture().build());
    await view.loadModels(new FakeModelLoader());
    const hooks = named(view, "hooks:");
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((m) => m.visible)).toBe(true);
    expect(view.root.getObjectByName("c1")).toBeDefined();
    expect(view.root.getObjectByName("c1")?.visible).toBe(false);
    view.dispose();
  });

  it("preloads the distinct ids and instances rather than cloning per cell", async () => {
    const map = fixture().build();
    const view = new TacticalMapView(map);
    const models = new FakeModelLoader();
    await view.loadModels(models);

    // One preload pass; each model loads once, with one extra ground lookup
    // supplying the ramp's borrowed surface material (#875), and one lookup
    // per natural surface to read its authored atlas region (#945).
    expect(models.preloaded).toHaveLength(1);
    const distinct = new Set(models.loaded);
    expect(models.loaded.length).toBe(distinct.size + 3);
    expect(
      models.loaded.filter((id) => id === "tile.ramp.connector"),
    ).toHaveLength(1);
    // Far fewer draw calls than tiles: the grass field is one instanced
    // mesh per part, not one object per tile.
    const grass = named(view, "tiles-model:tile.ground.grass:");
    expect(grass).toHaveLength(2); // the fake model's body and detail
    expect(grass[0]?.count).toBeGreaterThan(4);
    view.dispose();
  });

  it("bakes each part's offset from the pivot into every instance", async () => {
    const view = new TacticalMapView(fixture().build());
    await view.loadModels(new FakeModelLoader());
    const grass = named(view, "tiles-model:tile.ground.grass:");
    // The fake model adds its body first and its offset detail second;
    // meshPartsOf preserves that order.
    const [body, detail] = grass;
    const bodyAt = new Vector3().setFromMatrixPosition(readInstance(body, 0));
    const detailAt = new Vector3().setFromMatrixPosition(
      readInstance(detail, 0),
    );
    expect(detailAt.x - bodyAt.x).toBeCloseTo(0.25);
    expect(detailAt.y - bodyAt.y).toBeCloseTo(0.5);
    view.dispose();
  });

  it("turns a piece clockwise seen from above", async () => {
    // A north-south road takes one quarter turn, which carries +X onto +Z.
    const b = new FixtureMapBuilder(3, 3, 1).fillGround(0, SurfaceIds.DIRT);
    b.tile({ x: 1, y: 0, z: 0 }, SurfaceIds.ROAD);
    b.tile({ x: 1, y: 0, z: 1 }, SurfaceIds.ROAD);
    b.tile({ x: 1, y: 0, z: 2 }, SurfaceIds.ROAD);
    const view = new TacticalMapView(b.build());
    await view.loadModels(new FakeModelLoader());
    const road = named(view, "tiles-model:tile.city.road-straight:")[0];
    const axis = new Vector3(1, 0, 0).applyMatrix4(
      new Matrix4().extractRotation(readInstance(road, 0)),
    );
    expect(axis.x).toBeCloseTo(0);
    expect(axis.z).toBeCloseTo(1);
    view.dispose();
  });

  it("is idempotent: a second call adds nothing and fetches nothing", async () => {
    const view = new TacticalMapView(fixture().build());
    const models = new FakeModelLoader();
    await view.loadModels(models);
    const before = allInstanced(view).length;
    const fetched = models.loaded.length;
    await view.loadModels(models);
    expect(allInstanced(view)).toHaveLength(before);
    expect(models.loaded).toHaveLength(fetched);
    view.dispose();
  });
});

/** The instance matrix at an index; the mesh must exist. */
function readInstance(mesh: InstancedMesh | undefined, i: number): Matrix4 {
  if (mesh === undefined) {
    throw new Error("expected an instanced mesh");
  }
  const matrix = new Matrix4();
  mesh.getMatrixAt(i, matrix);
  return matrix;
}

// ===========================================
// Vision (#551)
// ===========================================

describe("TacticalMapView.setVision", () => {
  /** The tile keys of the fixture map, by coordinate. */
  function keysOf(map: TacticalMap) {
    const index = new TileIndex(map);
    return (coord: { x: number; y: number; z: number }) => index.keyOf(coord);
  }

  /** Scale of instance `i`; a tile keeps it whatever the side knows (#761). */
  function scaleOf(mesh: InstancedMesh, i: number): number {
    const matrix = new Matrix4();
    mesh.getMatrixAt(i, matrix);
    return new Vector3().setFromMatrixScale(matrix).length();
  }

  /** Colour multiplier of instance `i`; white in view, cold when remembered. */
  function tintOf(mesh: InstancedMesh, i: number): Color {
    const colour = new Color();
    mesh.getColorAt(i, colour);
    return colour;
  }

  /** The instanced mesh holding the ground pillars at level 0. */
  function ground(view: TacticalMapView): InstancedMesh {
    const found = allInstanced(view).find((m) =>
      m.name.startsWith("tiles-ground:"),
    );
    if (!found) throw new Error("no ground pillars");
    return found;
  }

  it("draws every tile when there is no vision to respect", () => {
    const view = new TacticalMapView(fixture().build());
    view.setVision(undefined);
    const mesh = ground(view);
    for (let i = 0; i < mesh.count; i++) {
      expect(scaleOf(mesh, i)).toBeGreaterThan(0);
    }
    view.dispose();
  });

  it("darkens the unexplored, dims the remembered and shows what is in view", () => {
    const map = fixture().build();
    const key = keysOf(map);
    const view = new TacticalMapView(map);
    view.setVision({
      visible: [key({ x: 0, y: 0, z: 0 })],
      explored: [key({ x: 0, y: 0, z: 0 }), key({ x: 1, y: 0, z: 0 })],
      spotted: [],
      lastSeen: {},
    });

    // Tiles are batched per surface, so find each instance by where it
    // stands rather than by an index into one mesh.
    const at = (x: number, z: number) => {
      for (const mesh of allInstanced(view).filter((m) =>
        m.name.startsWith("tiles-"),
      )) {
        for (let i = 0; i < mesh.count; i++) {
          const matrix = new Matrix4();
          mesh.getMatrixAt(i, matrix);
          const scale = new Vector3().setFromMatrixScale(matrix).length();
          const at3 = new Vector3().setFromMatrixPosition(matrix);
          // A collapsed instance keeps its translation, so match on that.
          if (
            Math.abs(at3.x - (x + 0.5)) < 0.01 &&
            Math.abs(at3.z - (z + 0.5)) < 0.01
          ) {
            return { scale, tint: tintOf(mesh, i) };
          }
        }
      }
      return undefined;
    };

    expect(at(0, 0)?.scale).toBeGreaterThan(0);
    const seen = at(0, 0)?.tint;
    expect(seen?.r).toBeCloseTo(1);
    expect(seen?.g).toBeCloseTo(1);
    expect(seen?.b).toBeCloseTo(1);

    expect(at(1, 0)?.scale).toBeGreaterThan(0);
    const remembered = at(1, 0)?.tint;
    // Memory keeps its weight -- the green channel still carries
    // VISION_DIM, so fog recedes exactly as far as it always did.
    expect(remembered?.g).toBeCloseTo(VISION_DIM);
    // ...and takes a channel lighting never uses (#661). A neutral
    // multiply is precisely what a shadow does, so memory drawn that way
    // was indistinguishable from a shadowed tile the player *can* see.
    // Cold, and unmistakably so: blue above green above red.
    expect(remembered?.b).toBeGreaterThan(remembered!.g);
    expect(remembered?.g).toBeGreaterThan(remembered!.r);

    // Never seen: still standing (#761), with the same cold base as memory.
    // Scene mist owns the distinction now (#770), not a darker tint.
    expect(at(3, 0)?.scale).toBeGreaterThan(0);
    const unseen = at(3, 0)?.tint;
    expect(unseen?.g).toBeCloseTo(VISION_UNEXPLORED);
    expect(unseen).toEqual(remembered);
    expect(unseen?.b).toBeGreaterThan(unseen!.g);
    expect(unseen?.g).toBeGreaterThan(unseen!.r);
    expect(view.root.getObjectByName("unexplored-fog-0")?.visible).toBe(true);
    view.setVision(undefined);
    expect(view.root.getObjectByName("unexplored-fog-0")?.visible).toBe(false);
    view.dispose();
  });

  it("draws every tile the side has never seen, darkened rather than gone", () => {
    // The fault behind #748: these used to be zero-scaled, so the map
    // ended in a cliff along the seen area and buildings lost the walls
    // on tiles not yet reached.
    const map = fixture().build();
    const view = new TacticalMapView(map);
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    for (const mesh of allInstanced(view).filter((m) =>
      m.name.startsWith("tiles-"),
    )) {
      for (let i = 0; i < mesh.count; i++) {
        const label = `${mesh.name}#${String(i)}`;
        expect(scaleOf(mesh, i), label).toBeGreaterThan(0);
        expect(tintOf(mesh, i).g, label).toBeCloseTo(VISION_UNEXPLORED);
      }
    }
    view.dispose();
  });

  it("keeps an unexplored tile out of picking even though it is drawn", () => {
    const map = fixture().build();
    const view = new TacticalMapView(map);
    const camera = new OrthographicCamera(0, 4, 0, -3, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(new Vector3(0, 0, 0));
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const ndcAt = (x: number, z: number) => {
      const v = new Vector3(x, 0, z).project(camera);
      return { x: v.x, y: v.y };
    };
    // Visible before vision is applied...
    expect(view.pickTile(ndcAt(1.5, 0.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
    // ...still a target when merely remembered: it is drawn, and a move
    // onto ground the side knows is an order it could always give...
    const key = keysOf(map);
    view.setVision({
      visible: [],
      explored: [key({ x: 1, y: 0, z: 0 })],
      spotted: [],
      lastSeen: {},
    });
    expect(view.pickTile(ndcAt(1.5, 0.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 0,
    });
    // ...and, although drawn since #761, deliberately not once unexplored.
    // It was unhittable before only because it was zero-scaled; keeping
    // it so means a render fix does not decide whether a move may be
    // ordered into fog. Change this here, on purpose, if that is decided.
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(view.pickTile(ndcAt(1.5, 0.5), camera)).toBeUndefined();
    view.dispose();
  });

  it("tints a connector with the tile it arrives on instead of hiding it", () => {
    // Until #761 a connector was shown or hidden, and a remembered ramp
    // drew at full colour beside dimmed ground. Same three rungs now.
    const map = fixture().build();
    const key = keysOf(map);
    const view = new TacticalMapView(map);
    const ramp = map.connectors[0];
    if (!ramp) throw new Error("fixture has no connector");
    let hit: Mesh | undefined;
    view.root.traverse((o) => {
      if (o instanceof Mesh && o.name === ramp.id) hit = o;
    });
    const mesh = hit;
    if (!mesh) throw new Error("no connector mesh");
    const base = new Color(CONNECTOR_COLOURS.ramp);
    const green = () => (mesh.material as MeshStandardMaterial).color.g;

    view.setVision({
      visible: [],
      explored: [key(ramp.to)],
      spotted: [],
      lastSeen: {},
    });
    expect(mesh.visible).toBe(true);
    expect(green()).toBeCloseTo(base.g * VISION_DIM);

    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(mesh.visible).toBe(true);
    expect(green()).toBeCloseTo(base.g * VISION_UNEXPLORED);

    view.setVision({
      visible: [key(ramp.to)],
      explored: [key(ramp.to)],
      spotted: [],
      lastSeen: {},
    });
    expect(green()).toBeCloseTo(base.g);
    view.dispose();
  });

  it("applies to models loaded after the vision was set", async () => {
    const map = fixture().build();
    const view = new TacticalMapView(map);
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    await view.loadModels(new FakeModelLoader());
    for (const mesh of allInstanced(view).filter((m) =>
      m.name.includes("-model:"),
    )) {
      for (let i = 0; i < mesh.count; i++) {
        expect(scaleOf(mesh, i), mesh.name).toBeGreaterThan(0);
        expect(tintOf(mesh, i).g, mesh.name).toBeCloseTo(VISION_UNEXPLORED);
      }
    }
    view.dispose();
  });
});

// ===========================================
// Overlapping hook markers (#477)
// ===========================================

/** The y of a batch's first instance, which is where its markers sit. */
function firstInstanceY(view: TacticalMapView, name: string): number {
  const mesh = meshesIn(view, 0).find((m) => m.name === name);
  if (!mesh) throw new Error(`no batch named ${name}`);
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  return new Vector3().setFromMatrixPosition(matrix).y;
}

describe("overlapping hook markers", () => {
  it("puts extraction above deploy on a tile that is both (#477)", () => {
    // The extraction hook defaults to the deploy zone's tiles, which is
    // not a contrivance: measured across 24 generated maps every deploy
    // tile is also an extraction tile, 384 of 384 (ADR 0004 §4.6). Drawn
    // at one height these are coincident coplanar quads and the winner
    // was whichever batch drew last.
    const view = new TacticalMapView(fixture().build());
    const deploy = firstInstanceY(view, "hooks:hook:deploy:0");
    const extraction = firstInstanceY(view, "hooks:hook:extraction:0");
    expect(extraction).toBeGreaterThan(deploy);
    // Ordered, not stacked: the gap must not read as height.
    expect(extraction - deploy).toBeLessThan(0.02);
    view.dispose();
  });

  it("still draws both markers rather than dropping one", () => {
    // A single marker per tile would be the truer picture, but with the
    // two tile sets identical it would mean one kind never appearing
    // anywhere in the game. That is a visual decision, not a bug fix.
    const names = meshesIn(new TacticalMapView(fixture().build()), 0).map(
      (m) => m.name,
    );
    expect(names).toContain("hooks:hook:deploy:0");
    expect(names).toContain("hooks:hook:extraction:0");
  });
});

// ===========================================
// Stairs get their model (#766)
// ===========================================

describe("TacticalMapView stairs", () => {
  it("replaces stairs and ramp planks and keeps them retired when vision changes", async () => {
    const b = fixture();
    b.tile({ x: 0, y: 0, z: 0 }, SurfaceIds.STAIRS);
    b.tile({ x: 1, y: 1, z: 0 }, SurfaceIds.ROCK);
    b.connector("stairs", { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });
    const map = b.build();
    const stairs = map.connectors.find((c) => c.kind === "stairs");
    const ramp = map.connectors.find((c) => c.kind === "ramp");
    if (!stairs || !ramp) throw new Error("fixture needs a stairs and a ramp");
    const view = new TacticalMapView(map);
    const plankOf = (id: string) => {
      let hit: Mesh | undefined;
      view.root.traverse((o) => {
        if (o instanceof Mesh && o.name === id) hit = o;
      });
      return hit;
    };
    // Before the models: both connectors are placeholder planks.
    expect(plankOf(stairs.id)?.visible).toBe(true);
    expect(plankOf(ramp.id)?.visible).toBe(true);

    await view.loadModels(new FakeModelLoader());

    // The stairs plank retires: the stairs tile's own model draws the
    // staircase now, through the tile path like any other surface...
    expect(plankOf(stairs.id)?.visible).toBe(false);
    expect(
      allInstanced(view).some((m) => m.name.includes("building.stairs")),
    ).toBe(true);
    // ...and the ramp's own materialled model replaces its plank (#875).
    expect(plankOf(ramp.id)?.visible).toBe(false);
    expect(
      allInstanced(view).some((m) => m.name.includes("tile.ramp.connector")),
    ).toBe(true);

    // Vision must not bring the retired plank back (#766): it used to
    // toggle every connector's visibility on each call.
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(plankOf(stairs.id)?.visible).toBe(false);
    expect(plankOf(ramp.id)?.visible).toBe(false);
    view.dispose();
  });
});

// ===========================================
// Layer focus (#961, #978)
// ===========================================

/** A building record with only what the cut reads filled in honestly. */
function building(id: string, groundLevel: number, floors: number): Building {
  return {
    id,
    kind: "test",
    footprint: [{ x: 0, z: 0, w: 1, d: 1 }],
    groundLevel,
    floors: Array.from({ length: floors }, (_, index) => ({
      index,
      y: groundLevel + index * STOREY_LAYERS,
      rooms: [],
    })),
    roof: { kind: "flat", walkable: false },
    entrances: [],
    connectorIds: [],
  };
}

/**
 * Two one-tile buildings on the same map, `low` on the ground and `high`
 * up a step, each two storeys. The shape #978 is about: 43 % of
 * generated maps have buildings a whole storey or more apart.
 */
function hillside(highGround: number): FixtureMapBuilder {
  const b = new FixtureMapBuilder(4, 3, highGround + 6).fillGround();
  b.building(building("low", 0, 2));
  b.building(building("high", highGround, 2));
  for (let floor = 0; floor < 2; floor++) {
    b.tile({ x: 0, y: floor * STOREY_LAYERS, z: 0 }, SurfaceIds.FLOOR, {
      buildingId: "low",
      floorIndex: floor,
    });
    b.tile(
      { x: 2, y: highGround + floor * STOREY_LAYERS, z: 2 },
      SurfaceIds.FLOOR,
      { buildingId: "high", floorIndex: floor },
    );
  }
  // The stair up to the LOW building's first floor. It has to be this
  // one: the high building's stair lands in a level group the coarse
  // cut already hides, so a test on it passes whether or not connectors
  // have a rule of their own. This one lands inside a visible group and
  // is only hidden if the connector rule works.
  b.connector("ladder", { x: 0, y: 0, z: 0 }, { x: 0, y: STOREY_LAYERS, z: 0 });
  return b;
}

/** Whether the group for an engine level is showing at all. */
function levelGroupVisible(view: TacticalMapView, level: number): boolean {
  return view.root.children.some(
    (child) => child.name === `level-${String(level)}` && child.visible,
  );
}

/**
 * Whether the map's one connector is drawn. Matched by the id the map
 * gives it — connector meshes are named after the connector, so this
 * cannot pass by finding some other mesh.
 */
function connectorDrawn(view: TacticalMapView, map: TacticalMap): boolean {
  const id = map.connectors[0]?.id;
  let drawn = false;
  view.root.traverse((object) => {
    if (object.name === id && object.visible && object.parent?.visible) {
      drawn = true;
    }
  });
  return drawn;
}

/**
 * The engine layers that still have something drawn on them: a group
 * that is visible, holding at least one instance that has not been
 * collapsed by the cut.
 *
 * Read off the group rather than matched in a mesh name, so the
 * assertion cannot pass on a coincidence in a model id.
 */
function drawnLevels(view: TacticalMapView): number[] {
  const levels = new Set<number>();
  const matrix = new Matrix4();
  view.root.traverse((object) => {
    if (!(object instanceof InstancedMesh)) {
      return;
    }
    const group = object.parent;
    if (!group?.visible || !group.name.startsWith("level-")) {
      return;
    }
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      // A collapsed instance has a zero determinant; a drawn one does not.
      if (matrix.determinant() !== 0) {
        levels.add(Number(group.name.slice("level-".length)));
      }
    }
  });
  return [...levels].sort((a, b) => a - b);
}

describe("TacticalMapView.setLayerFocus", () => {
  // The reported case. Before #978 the cut was one height taken from the
  // lowest building, so at floor 1 the building up the step had its
  // ground floor above the cut and vanished entirely.
  it("opens every building at its own floor, however high it stands", () => {
    const map = hillside(4).build();
    const view = new TacticalMapView(map);
    view.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });

    // Level 0 is the low building's ground floor, level 4 the high
    // one's -- four layers above the cut the low building takes, and
    // drawn. Level 2 and level 6 are the two first floors, and neither
    // is. Before #978 this was `[0]`: the high building was gone.
    expect(drawnLevels(view)).toEqual([0, 4]);
  });

  // The known-good control. On a map whose buildings share a ground
  // level the two rules are the same number, so nothing may change --
  // 57 % of generated maps are this case, including the seed #977's
  // frames come from.
  it("draws exactly what the height cut drew when every building is level", () => {
    const flat = hillside(0).build();
    const byHeight = new TacticalMapView(flat);
    byHeight.setMaxLevel(1);
    const byStorey = new TacticalMapView(flat);
    byStorey.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(drawnLevels(byStorey)).toEqual(drawnLevels(byHeight));
    // And it is not vacuous: the cut is doing something on this map.
    expect(drawnLevels(byStorey)).toEqual([0]);
  });

  it("keeps roofs above the last floor at the top storey, including after a cut", () => {
    const fixture = hillside(4);
    // Generated roof tiles have a building id but no floorIndex, and sit
    // one storey above the final interior floor. The old fixture omitted them.
    fixture.tile({ x: 2, y: 8, z: 2 }, SurfaceIds.ROOF, { buildingId: "high" });
    const view = new TacticalMapView(fixture.build());
    const all = drawnLevels(view);
    expect(all).toEqual([0, 2, 4, 6, 8]);
    const top = { storey: 1, storeyCount: 2, cutLevel: undefined };
    view.setLayerFocus(top);
    expect(drawnLevels(view)).toEqual(all);
    view.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(drawnLevels(view)).toEqual([0, 4]);
    view.setLayerFocus(top);
    expect(drawnLevels(view)).toEqual(all);
    view.dispose();
  });

  // A connector is its own mesh, not an instance in a batch, so it needs
  // its own rule. Without one a staircase hangs in the air above a
  // building whose upper floors have been cut away.
  it("hides a staircase that climbs above the cut", () => {
    const map = hillside(4).build();
    const view = new TacticalMapView(map);
    expect(map.connectors).toHaveLength(1);
    const stair = map.connectors[0];
    // The guard that keeps this test honest: the stair lands on a level
    // the coarse group cut still shows, so only the connector's own
    // rule can hide it. Deleting that rule must turn this red.
    expect(stair?.to.y).toBe(STOREY_LAYERS);

    view.setLayerFocus(undefined);
    expect(connectorDrawn(view, map)).toBe(true);
    view.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(levelGroupVisible(view, STOREY_LAYERS)).toBe(true);
    expect(connectorDrawn(view, map)).toBe(false);
    view.setLayerFocus({ storey: 1, storeyCount: 2, cutLevel: undefined });
    expect(connectorDrawn(view, map)).toBe(true);
  });

  // Fog and the cut share one loop and one matrix write. They must not
  // share a reason: vision decides tint, the cut decides existence.
  it("keeps a cut tile hidden whatever vision says about it", () => {
    const map = hillside(4).build();
    const view = new TacticalMapView(map);
    view.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    const cut = drawnLevels(view);
    const index = new TileIndex(map);
    view.setVision({
      visible: map.tiles.map((t) => index.keyOf(t)),
      explored: map.tiles.map((t) => index.keyOf(t)),
      spotted: [],
      lastSeen: {},
    });
    expect(drawnLevels(view)).toEqual(cut);
    expect(cut).toEqual([0, 4]);
  });
});

// ===========================================
// The flat-map control owed for #978 (#1019)
// ===========================================

/**
 * Two buildings sharing a ground level, each with floors **and a real
 * roof tile** — the `buildingId`-without-`floorIndex` shape every
 * fixture written for #978 omitted, which is how the roof omission
 * survived four sabotage checks.
 *
 * Flat is the case #978 promised not to change: with every building on
 * one ground level the per-building storey cut and the old single height
 * cut are the same number, so the two must draw the same map at every
 * step of the range — including the top, where "no cut" has to mean no
 * cut for buildings as well as for terrain.
 */
function flatWithRoofs(): FixtureMapBuilder {
  const b = new FixtureMapBuilder(8, 8, 10).fillGround();
  b.building(building("tall", 0, 3));
  b.building(building("short", 0, 1));
  for (let floor = 0; floor < 3; floor++) {
    b.tile({ x: 1, y: floor * STOREY_LAYERS, z: 1 }, SurfaceIds.FLOOR, {
      buildingId: "tall",
      floorIndex: floor,
    });
  }
  b.tile({ x: 1, y: 3 * STOREY_LAYERS, z: 1 }, SurfaceIds.FLOOR, {
    buildingId: "tall",
  });
  b.tile({ x: 5, y: 0, z: 5 }, SurfaceIds.FLOOR, {
    buildingId: "short",
    floorIndex: 0,
  });
  b.tile({ x: 5, y: 1 * STOREY_LAYERS, z: 5 }, SurfaceIds.FLOOR, {
    buildingId: "short",
  });
  return b;
}

describe("the flat-map control for #978", () => {
  it("draws exactly what the old height cut drew, at every storey", () => {
    const map = flatWithRoofs().build();
    // Three storeys, from the tallest building's floor count.
    const storeys = 3;
    for (let storey = 0; storey < storeys; storey++) {
      const cutLevel = storey === storeys - 1 ? undefined : storey * 2 + 1;
      const byHeight = new TacticalMapView(map);
      byHeight.setMaxLevel(cutLevel);
      const byStorey = new TacticalMapView(map);
      byStorey.setLayerFocus({ storey, storeyCount: storeys, cutLevel });
      expect(
        drawnLevels(byStorey),
        `storey ${String(storey)} must draw what the height cut drew`,
      ).toEqual(drawnLevels(byHeight));
    }
  });

  // The specific omission, stated as its own expectation so a reader
  // does not have to infer it from the loop above: at the top of the
  // range every roof is drawn, including the tallest building's, whose
  // storey is one above the top floor index.
  it("draws both roofs at the top of the range", () => {
    const view = new TacticalMapView(flatWithRoofs().build());
    view.setLayerFocus({ storey: 2, storeyCount: 3, cutLevel: undefined });
    // Level 6 is the tall roof, level 2 the short one.
    expect(drawnLevels(view)).toContain(6);
    expect(drawnLevels(view)).toContain(2);
  });
});
