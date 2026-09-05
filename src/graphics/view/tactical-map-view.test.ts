import type { InstancedMesh, Object3D } from "three";
import {
  BoxGeometry,
  Group,
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { HookKinds } from "../../mapgen/model/hook";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { ModelAssetId } from "../../content/data/model-ids";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import {
  CONNECTOR_COLOURS,
  LEVEL_HEIGHT,
  SLAB_HEIGHT,
} from "../data/mapgen-preview-palette";
import type { ModelLoader } from "../model/model-loader";
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
    const top = LEVEL_HEIGHT + SLAB_HEIGHT;
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

  it("keeps the hook markers and connectors, which have no models", async () => {
    const view = new TacticalMapView(fixture().build());
    await view.loadModels(new FakeModelLoader());
    const hooks = named(view, "hooks:");
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks.every((m) => m.visible)).toBe(true);
    expect(view.root.getObjectByName("c1")).toBeDefined();
    view.dispose();
  });

  it("preloads the distinct ids and instances rather than cloning per cell", async () => {
    const map = fixture().build();
    const view = new TacticalMapView(map);
    const models = new FakeModelLoader();
    await view.loadModels(models);

    // One preload pass covering every distinct id, then one load per id.
    expect(models.preloaded).toHaveLength(1);
    const distinct = new Set(models.loaded);
    expect(models.loaded.length).toBe(distinct.size);
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
  it("replaces the stairs plank with the stairs model and keeps the ramp's", async () => {
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
    // ...and the ramp, which has no art, keeps its plank.
    expect(plankOf(ramp.id)?.visible).toBe(true);

    // Vision must not bring the retired plank back (#766): it used to
    // toggle every connector's visibility on each call.
    view.setVision({ visible: [], explored: [], spotted: [], lastSeen: {} });
    expect(plankOf(stairs.id)?.visible).toBe(false);
    view.dispose();
  });
});
