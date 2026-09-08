import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../tactical/model/unit-weapon";
import type { Object3D } from "three";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { STOREY_LAYERS } from "../../core/model/elevation";
import type { ModelAssetId } from "../../content/data/model-ids";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Building } from "../../mapgen/model/building";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { tileTop } from "../view/tactical-map-view";
import type { Spawner } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { LAYER_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import type { ModelLoader } from "../model/model-loader";
import {
  SPAWNER_MODEL_ID,
  TacticalSceneBuilder,
} from "./tactical-scene-builder";

// ===========================================
// Fixtures
// ===========================================

/** Loads a box per id, counting fetches, and lets a test hold a load open. */
class FakeModelLoader implements ModelLoader {
  readonly loads: ModelAssetId[] = [];
  private gate: Promise<void> = Promise.resolve();
  private release: (() => void) | undefined;

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.release = resolve;
    });
  }

  open(): void {
    this.release?.();
    this.release = undefined;
  }

  async load(id: ModelAssetId): Promise<Object3D> {
    this.loads.push(id);
    await this.gate;
    const group = new Group();
    const box = new Mesh(
      new BoxGeometry(0.8, 1, 0.8),
      new MeshStandardMaterial(),
    );
    box.name = `box:${id}`;
    box.position.y = 0.5;
    group.add(box);
    return group;
  }

  async preload(): Promise<void> {
    await this.gate;
  }
}

const TEMPLATES: Record<string, UnitTemplate> = {
  "squad:squad-1": template("squad:squad-1", "tdf.infantry.rifle", "infantry"),
  "bug:swarmer": template("bug:swarmer", "bug.swarmer", "infantry"),
};

function template(
  id: string,
  modelId: ModelAssetId,
  passClass: "infantry" | "mech",
): UnitTemplate {
  return {
    id,
    name: id,
    maxHp: 10,
    maxAp: 2,
    move: 5,
    weapons: [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: { range: 5, accuracy: 60, damage: 3, armorPen: 0 },
      },
    ],
    sightRange: 12,
    armor: 0,
    passClass,
    modelId,
  };
}

function unit(
  id: string,
  templateId: string,
  x: number,
  z: number,
  hp = 10,
): Unit {
  return {
    id,
    kind: templateId.startsWith("bug") ? "bug" : "squad",
    team: templateId.startsWith("bug") ? "bugs" : "tdf",
    sourceId: id,
    templateId,
    pos: { x, y: 0, z },
    facing: "n",
    hp,
    maxHp: 10,
    ap: 2,
    maxAp: 2,
    status: [],
    passClass: "infantry",
  };
}

function build(): { builder: TacticalSceneBuilder; models: FakeModelLoader } {
  const map = new FixtureMapBuilder(6, 6, 1).fillGround().build();
  const models = new FakeModelLoader();
  return { builder: new TacticalSceneBuilder({ map, models }), models };
}

/** A top-down orthographic camera over the whole fixture map. */
function topDownCamera(): OrthographicCamera {
  const camera = new OrthographicCamera(0, 6, 0, -6, 0.1, 100);
  camera.position.set(0, 20, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(new Vector3(0, 0, 0));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** NDC of a world x/z point under `topDownCamera`. */
function ndcOf(x: number, z: number): { x: number; y: number } {
  const camera = topDownCamera();
  const v = new Vector3(x, 0, z).project(camera);
  return { x: v.x, y: v.y };
}

// ===========================================
// Tests
// ===========================================

describe("TacticalSceneBuilder", () => {
  it("wraps the map view and exposes its centre and levels", () => {
    const { builder } = build();
    expect(builder.root.getObjectByName("tactical-map")).toBeDefined();
    expect(builder.root.getObjectByName("units")).toBeDefined();
    expect(builder.centre).toEqual({ x: 3, y: 0, z: 3 });
    expect(builder.levels).toEqual([0]);
  });

  it("loads one model per template and places each unit at its tile", async () => {
    const { builder, models } = build();
    await builder.update(
      [unit("u1", "squad:squad-1", 1, 1), unit("u2", "bug:swarmer", 4, 2)],
      TEMPLATES,
    );
    expect(models.loads.sort()).toEqual(["bug.swarmer", "tdf.infantry.rifle"]);
    expect(builder.unitIds()).toEqual(["u1", "u2"]);
    expect(builder.unitWorldPosition("u1")).toEqual({
      x: 1.5,
      y: SLAB_HEIGHT,
      z: 1.5,
    });
    expect(builder.unitWorldPosition("u2")).toEqual({
      x: 4.5,
      y: SLAB_HEIGHT,
      z: 2.5,
    });
    expect(builder.root.getObjectByName("units")?.children).toHaveLength(2);
    expect(LAYER_HEIGHT).toBeGreaterThan(0);
  });

  it("re-poses moved units without reloading, and removes gone or dead units", async () => {
    const { builder, models } = build();
    await builder.update(
      [unit("u1", "squad:squad-1", 1, 1), unit("u2", "bug:swarmer", 4, 2)],
      TEMPLATES,
    );
    await builder.update(
      [
        { ...unit("u1", "squad:squad-1", 2, 3), facing: "s" },
        unit("u2", "bug:swarmer", 4, 2, 0),
      ],
      TEMPLATES,
    );
    expect(models.loads).toHaveLength(2);
    expect(builder.unitIds()).toEqual(["u1"]);
    expect(builder.unitWorldPosition("u1")).toEqual({
      x: 2.5,
      y: SLAB_HEIGHT,
      z: 3.5,
    });
    expect(builder.unitWorldPosition("u2")).toBeUndefined();
    await builder.update([], TEMPLATES);
    expect(builder.root.getObjectByName("units")?.children).toHaveLength(0);
  });

  it("discards a load for a unit removed while its model was loading", async () => {
    const { builder, models } = build();
    models.hold();
    const pending = builder.update(
      [unit("u1", "squad:squad-1", 1, 1)],
      TEMPLATES,
    );
    await builder.update([], TEMPLATES);
    models.open();
    await pending;
    expect(builder.unitIds()).toEqual([]);
    expect(builder.root.getObjectByName("units")?.children).toHaveLength(0);
  });

  it("throws on a unit whose template is missing", async () => {
    const { builder } = build();
    await expect(
      builder.update([unit("u1", "ghost", 1, 1)], TEMPLATES),
    ).rejects.toThrow(/unknown template "ghost"/);
  });

  it("picks the unit under a ray and highlights hover and selection", async () => {
    const { builder } = build();
    await builder.update(
      [unit("u1", "squad:squad-1", 1, 1), unit("u2", "bug:swarmer", 4, 4)],
      TEMPLATES,
    );
    const camera = topDownCamera();
    expect(builder.pickUnit(ndcOf(1.5, 1.5), camera)).toBe("u1");
    expect(builder.pickUnit(ndcOf(4.5, 4.5), camera)).toBe("u2");
    expect(builder.pickUnit(ndcOf(3, 3), camera)).toBeUndefined();

    builder.setHovered("u1");
    builder.setSelected("u2");
    const ring = (id: string, name: string) =>
      builder.root.getObjectByName(`unit:${id}`)?.getObjectByName(name)
        ?.visible;
    expect(ring("u1", "hover-ring")).toBe(true);
    expect(ring("u1", "selection-ring")).toBe(false);
    expect(ring("u2", "selection-ring")).toBe(true);
    expect(builder.getSelected()).toBe("u2");

    await builder.update([unit("u1", "squad:squad-1", 1, 1)], TEMPLATES);
    expect(builder.getSelected()).toBeUndefined();
    expect(builder.pickUnit(ndcOf(4.5, 4.5), camera)).toBeUndefined();
  });

  it("forwards tile picking to the map view, unobstructed by units", async () => {
    const { builder } = build();
    await builder.update([unit("u1", "squad:squad-1", 1, 1)], TEMPLATES);
    const camera = topDownCamera();
    expect(builder.pickTile(ndcOf(1.5, 1.5), camera)).toEqual({
      x: 1,
      y: 0,
      z: 1,
    });
    expect(builder.pickTile(ndcOf(4.5, 4.5), camera)).toEqual({
      x: 4,
      y: 0,
      z: 4,
    });
    expect(builder.tileWorldPosition({ x: 4, y: 0, z: 4 })).toEqual({
      x: 4.5,
      y: SLAB_HEIGHT,
      z: 4.5,
    });
  });

  it("dispose empties the scene", async () => {
    const parent = new Group();
    const { builder } = build();
    parent.add(builder.root);
    await builder.update([unit("u1", "squad:squad-1", 1, 1)], TEMPLATES);
    builder.dispose();
    expect(parent.children).toHaveLength(0);
    expect(builder.unitIds()).toEqual([]);
  });
});

// ===========================================
// Egg spawners (#484)
// ===========================================

describe("TacticalSceneBuilder spawners", () => {
  /** A standing spawner at the tile, or a destroyed one. */
  function spawner(
    id: string,
    x: number,
    z: number,
    destroyed = false,
  ): Spawner {
    return {
      id,
      pos: { x, y: 0, z },
      hatchRadius: 3,
      hp: destroyed ? 0 : 20,
      timer: 2,
      destroyed,
    };
  }

  it("draws one model per standing spawner and loads the spawner model", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([spawner("s1", 1, 1), spawner("s2", 4, 4)]);
    expect(builder.spawnerIds()).toEqual(["s1", "s2"]);
    expect(models.loads).toEqual([SPAWNER_MODEL_ID, SPAWNER_MODEL_ID]);
    expect(builder.spawnerWorldPosition("s1")).toBeDefined();
  });

  it("never draws a destroyed spawner, and removes one destroyed later", async () => {
    const { builder } = build();
    await builder.updateSpawners([
      spawner("s1", 1, 1),
      spawner("s2", 4, 4, true),
    ]);
    expect(builder.spawnerIds()).toEqual(["s1"]);
    // The objective is met and the hive comes down.
    await builder.updateSpawners([spawner("s1", 1, 1, true)]);
    expect(builder.spawnerIds()).toEqual([]);
    expect(builder.spawnerWorldPosition("s1")).toBeUndefined();
  });

  it("places it on its own tile, so a pick over that tile finds it", async () => {
    const { builder } = build();
    await builder.updateSpawners([spawner("s1", 2, 3)]);
    const camera = topDownCamera();
    // Tile centres sit at +0.5 within the tile.
    const hit = builder.pickSpawner(ndcOf(2.5, 3.5), camera);
    expect(hit).toBe("s1");
    // Nothing over an empty corner.
    expect(builder.pickSpawner(ndcOf(5.5, 0.5), camera)).toBeUndefined();
  });

  it("stops answering picks once the spawner is destroyed", async () => {
    const { builder } = build();
    await builder.updateSpawners([spawner("s1", 2, 3)]);
    const camera = topDownCamera();
    expect(builder.pickSpawner(ndcOf(2.5, 3.5), camera)).toBe("s1");
    await builder.updateSpawners([spawner("s1", 2, 3, true)]);
    expect(builder.pickSpawner(ndcOf(2.5, 3.5), camera)).toBeUndefined();
  });

  it("keeps spawner highlighting independent of unit highlighting", async () => {
    const { builder } = build();
    await builder.update([unit("u1", "squad:squad-1", 0, 0)], TEMPLATES);
    await builder.updateSpawners([spawner("s1", 2, 3)]);
    builder.setSelected("u1");
    builder.setSelectedSpawner("s1");
    builder.setHoveredSpawner("s1");
    // Selecting the squad does not clear the spawner the HUD is aiming at.
    expect(builder.getSelected()).toBe("u1");
    expect(builder.spawnerWorldPosition("s1")).toBeDefined();
    // Clearing the spawner leaves the unit selection alone.
    builder.setSelectedSpawner(undefined);
    expect(builder.getSelected()).toBe("u1");
  });

  it("discards a load that finishes after the spawner was destroyed", async () => {
    const { builder, models } = build();
    models.hold();
    const pending = builder.updateSpawners([spawner("s1", 1, 1)]);
    await builder.updateSpawners([]);
    models.open();
    await pending;
    expect(builder.spawnerIds()).toEqual([]);
    expect(builder.spawnerWorldPosition("s1")).toBeUndefined();
  });

  it("drops every spawner on dispose", async () => {
    const { builder } = build();
    await builder.updateSpawners([spawner("s1", 1, 1)]);
    builder.dispose();
    expect(builder.spawnerIds()).toEqual([]);
  });
});

describe("TacticalSceneBuilder.loadMapModels", () => {
  it("upgrades the map to the registered art, and only once (#474)", async () => {
    const { builder, models } = build();
    await builder.loadMapModels();
    const drawn = models.loads.filter((id) => !id.startsWith("tdf."));
    expect(drawn.length).toBeGreaterThan(0);
    // Tile, building and prop art, not unit art.
    expect(
      drawn.every(
        (id) =>
          id.startsWith("tile.") ||
          id.startsWith("building.") ||
          id.startsWith("prop."),
      ),
    ).toBe(true);
    const after = models.loads.length;
    await builder.loadMapModels();
    expect(models.loads).toHaveLength(after);
    builder.dispose();
  });
});

// ===========================================
// Elevation tethers (#981)
// ===========================================

/** A building record with only what the cut and the tether read. */
function tetherBuilding(
  id: string,
  groundLevel: number,
  floors: number,
): Building {
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
 * A two-storey building on ground at (2, 2), so a unit can stand on its
 * first floor with the cut below.
 */
function tetherScene(): {
  builder: TacticalSceneBuilder;
  models: FakeModelLoader;
} {
  const b = new FixtureMapBuilder(6, 6, 6).fillGround();
  b.building(tetherBuilding("b", 0, 2));
  for (let floor = 0; floor < 2; floor++) {
    b.tile({ x: 2, y: floor * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
      buildingId: "b",
      floorIndex: floor,
    });
  }
  const models = new FakeModelLoader();
  return {
    builder: new TacticalSceneBuilder({ map: b.build(), models }),
    models,
  };
}

/** The tether meshes currently in the scene, by unit id. */
function tethersIn(builder: TacticalSceneBuilder): Map<string, Object3D> {
  const found = new Map<string, Object3D>();
  builder.root.traverse((object) => {
    if (object.name.startsWith("tether:")) {
      found.set(object.name.slice("tether:".length), object);
    }
  });
  return found;
}

describe("TacticalSceneBuilder elevation tethers", () => {
  const upstairs = (): Unit => ({
    ...unit("u1", "squad:squad-1", 2, 2),
    pos: { x: 2, y: STOREY_LAYERS, z: 2 },
  });

  // The reported case: the cut takes the first floor away and the unit
  // standing on it is left in the air.
  it("draws a line from a unit above the cut down to what is still drawn", async () => {
    const { builder } = tetherScene();
    await builder.update([upstairs()], TEMPLATES);
    // Uncut: the unit is standing on drawn floor, so no line.
    expect(tethersIn(builder).size).toBe(0);

    builder.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    const drawn = tethersIn(builder);
    expect([...drawn.keys()]).toEqual(["u1"]);
    // It spans from the ground it lands on to the unit's feet: the
    // first floor is at layer 2, the ground below it at layer 0.
    const line = drawn.get("u1");
    expect(line?.scale.y).toBeCloseTo(tileTop(STOREY_LAYERS) - tileTop(0));
    expect(line?.position.x).toBeCloseTo(2.5);
    expect(line?.position.z).toBeCloseTo(2.5);
  });

  // The control the ticket asks for: a unit below the cut must be
  // exactly as it was, which means no tether at all.
  it("draws nothing for a unit standing on floor the cut still shows", async () => {
    const { builder } = tetherScene();
    await builder.update([unit("u1", "squad:squad-1", 2, 2)], TEMPLATES);
    builder.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(tethersIn(builder).size).toBe(0);
  });

  // Sabotage-driven: the first version of these tests passed with the
  // support search ignoring the cut entirely, because the only thing
  // under the unit was ground that is never hidden. Three storeys, unit
  // on the second floor, cut to the ground: the line must skip the
  // first floor, which is itself cut away, and land on the ground.
  it("lands on the nearest surface the cut has NOT taken", async () => {
    const b = new FixtureMapBuilder(6, 6, 8).fillGround();
    b.building(tetherBuilding("b", 0, 3));
    for (let floor = 0; floor < 3; floor++) {
      b.tile({ x: 2, y: floor * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
        buildingId: "b",
        floorIndex: floor,
      });
    }
    const builder = new TacticalSceneBuilder({
      map: b.build(),
      models: new FakeModelLoader(),
    });
    await builder.update(
      [
        {
          ...unit("u1", "squad:squad-1", 2, 2),
          pos: { x: 2, y: 2 * STOREY_LAYERS, z: 2 },
        },
      ],
      TEMPLATES,
    );
    builder.setLayerFocus({ storey: 0, storeyCount: 3, cutLevel: 1 });
    const line = tethersIn(builder).get("u1");
    // Ground at layer 0, not the cut-away first floor at layer 2.
    expect(line?.scale.y).toBeCloseTo(tileTop(2 * STOREY_LAYERS) - tileTop(0));
  });

  it("retires the line when the cut rises back over the unit", async () => {
    const { builder } = tetherScene();
    await builder.update([upstairs()], TEMPLATES);
    builder.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(tethersIn(builder).size).toBe(1);
    builder.setLayerFocus({ storey: 1, storeyCount: 2, cutLevel: undefined });
    expect(tethersIn(builder).size).toBe(0);
  });

  it("retires the line when the unit dies", async () => {
    const { builder } = tetherScene();
    await builder.update([upstairs()], TEMPLATES);
    builder.setLayerFocus({ storey: 0, storeyCount: 2, cutLevel: 1 });
    expect(tethersIn(builder).size).toBe(1);
    await builder.update([{ ...upstairs(), hp: 0 }], TEMPLATES);
    expect(tethersIn(builder).size).toBe(0);
  });
});
