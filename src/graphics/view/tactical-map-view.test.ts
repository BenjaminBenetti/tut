import type { InstancedMesh } from "three";
import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { PropKindIds } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import { HookKinds } from "../../mapgen/model/hook";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { LEVEL_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import { TacticalMapView } from "./tactical-map-view";

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
    expect(names0).toContain("tiles:tile:grass:0:g");
    expect(names0).toContain("tiles:tile:road:0:g");
    expect(names0).toContain("props:prop:1:0");
    expect(names0).toContain("hooks:hook:deploy:0");
    expect(names0).toContain("hooks:hook:egg-spawner:0");
    const grass = meshesIn(view, 0).find(
      (m) => m.name === "tiles:tile:grass:0:g",
    );
    expect(grass?.count).toBe(11);

    const names1 = meshesIn(view, 1).map((m) => m.name);
    expect(names1).toContain("tiles:tile:rock:1:g");
    expect(names1).toContain("tiles:tile:floor:1:s");
    expect(names1).toContain("walls:wall:door:1");
    expect(names1).toContain("walls:wall:solid:1");
    expect(view.root.getObjectByName("c1")).toBeDefined();
    view.dispose();
  });

  it("stands ground pillars on the ground plane and slabs on their level", () => {
    const view = new TacticalMapView(fixture().build());
    const rock = meshesIn(view, 1).find(
      (m) => m.name === "tiles:tile:rock:1:g",
    );
    const floor = meshesIn(view, 1).find(
      (m) => m.name === "tiles:tile:floor:1:s",
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
      "tiles:tile:lava:0:g",
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
