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
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { mechAssemblyFor } from "../data/part-model-table";
import type { ModelAssetId } from "../../content/data/model-ids";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { Building } from "../../mapgen/model/building";
import { HookKinds } from "../../mapgen/model/hook";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import { tileTop } from "../view/tactical-map-view";
import type { Spawner } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { LAYER_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import type { ModelLoader } from "../model/model-loader";
import type { TechCarcass } from "../../tactical/model/tech-carcass";
import type { DroppedSpecimen } from "../../tactical/service/specimen-service";
import { SPECIMEN_NET_NAME } from "../view/specimen-view";
import type { MechWreck } from "../../tactical/model/mech-wreck";
import { WRECK_NAME_PREFIX } from "../view/wreck-view";
import { DORMANT_POSE } from "../view/dormant-look";
import {
  CARCASS_MODEL_ID,
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
  "mech:mech-1": {
    ...template("mech:mech-1", "tdf.mech.assembled-a", "mech"),
    loadout: STARTER_LOADOUT,
  },
  // A 2×2 unit (#1130): its position is the anchor tile of four. The
  // brute's art is authored at that footprint since #1134, so it draws
  // at unit scale; `bug:block` wears one-tile art and is scaled up.
  "bug:brute": {
    ...template("bug:brute", "bug.brute", "infantry"),
    footprint: 2,
  },
  "bug:block": {
    ...template("bug:block", "bug.swarmer", "infantry"),
    footprint: 2,
  },
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

  it("restores a saved brace pose on placement and follows later state changes", async () => {
    const { builder } = build();
    const mech = { ...unit("m", "mech:mech-1", 1, 1), braced: true };
    await builder.update([mech], TEMPLATES);
    expect(builder.unitMotion("m")?.braceAmount).toBe(1);
    builder.unitMotion("m")?.brace?.(0.5);
    await builder.update([mech], TEMPLATES);
    expect(builder.unitMotion("m")?.braceAmount).toBe(1);
    await builder.update([{ ...mech, braced: false }], TEMPLATES);
    expect(builder.unitMotion("m")?.braceAmount).toBe(0);
    builder.dispose();
  });

  it("places a dormant bug curled and uncurls it when its brood wakes (#1179)", async () => {
    const { builder } = build();
    const sleeper: Unit = {
      ...unit("b1", "bug:swarmer", 4, 2),
      status: ["dormant"],
    };
    const awake = unit("b2", "bug:swarmer", 4, 4);
    const modelOf = (id: string) =>
      builder.unitObject(id)?.getObjectByName(`unit-model:${id}`);
    await builder.update([sleeper, awake], TEMPLATES);
    const rest = modelOf("b2")!.scale.y;
    expect(modelOf("b1")!.scale.y).toBeCloseTo(rest * DORMANT_POSE.height);
    await builder.update([{ ...sleeper, status: [] }, awake], TEMPLATES);
    expect(modelOf("b1")!.scale.y).toBeCloseTo(rest);
    builder.dispose();
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

  it("draws a mech from the parts its loadout names, not the reference assembly (#1115)", async () => {
    const { builder, models } = build();
    const mech = { ...unit("m1", "mech:mech-1", 2, 2), kind: "mech" as const };
    await builder.update([mech], TEMPLATES);
    const assembly = mechAssemblyFor(STARTER_LOADOUT);
    expect(models.loads).toContain(assembly.armWeapon);
    expect(models.loads).toContain(assembly.legs);
    expect(models.loads).not.toContain("tdf.mech.assembled-a");
    expect(builder.unitIds()).toEqual(["m1"]);
    expect(builder.unitWorldPosition("m1")).toEqual({
      x: 2.5,
      y: SLAB_HEIGHT,
      z: 2.5,
    });
    // The death burst still tells a machine from a bug by the template's model family.
    expect(builder.unitModelId("m1")).toBe("tdf.mech.assembled-a");
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

  it("arrive places a unit where its walk begins, and the next update re-poses it (#1116)", async () => {
    const { builder, models } = build();
    await builder.update([unit("u1", "squad:squad-1", 1, 1)], TEMPLATES);
    const bug = unit("b1", "bug:swarmer", 4, 2);
    await builder.arrive(bug, TEMPLATES["bug:swarmer"]!, { x: 5, y: 0, z: 5 });
    expect(models.loads).toContain("bug.swarmer");
    expect(builder.unitIds()).toEqual(["u1", "b1"]);
    // At the start of the walk, not at the tile the state holds.
    expect(builder.unitWorldPosition("b1")).toEqual({
      x: 5.5,
      y: SLAB_HEIGHT,
      z: 5.5,
    });
    // Once on the board it is an ordinary unit: no second load, and the
    // redraw after the batch moves it to where the state says.
    await builder.arrive(bug, TEMPLATES["bug:swarmer"]!, { x: 0, y: 0, z: 0 });
    expect(models.loads.filter((id) => id === "bug.swarmer")).toHaveLength(1);
    await builder.update([unit("u1", "squad:squad-1", 1, 1), bug], TEMPLATES);
    expect(builder.unitWorldPosition("b1")).toEqual({
      x: 4.5,
      y: SLAB_HEIGHT,
      z: 2.5,
    });
    expect(models.loads.filter((id) => id === "bug.swarmer")).toHaveLength(1);
  });

  it("an arrival waits hidden: no cutaway opens around it and no pick finds it, until it moves (#1116)", async () => {
    const { builder } = build();
    await builder.update([unit("u1", "squad:squad-1", 1, 1)], TEMPLATES);
    const bug = unit("b1", "bug:swarmer", 4, 2);
    await builder.arrive(bug, TEMPLATES["bug:swarmer"]!, { x: 5, y: 0, z: 5 });
    const object = builder.unitObject("b1")!;
    expect(object.visible).toBe(false);
    // The wall cutaway centres on drawn units; an unseen bug in the dark
    // must not open a window that says where it is.
    expect(builder.ghostTargets().map((s) => s.object.name)).toEqual([
      "unit:u1",
    ]);
    expect(builder.pickUnit(ndcOf(5.5, 5.5), topDownCamera())).toBeUndefined();
    // The walk shows it (the queue sets `visible`); from then on it is
    // an ordinary unit.
    object.visible = true;
    expect(builder.ghostTargets().map((s) => s.object.name)).toEqual([
      "unit:u1",
      "unit:b1",
    ]);
    expect(builder.pickUnit(ndcOf(5.5, 5.5), topDownCamera())).toBe("b1");
  });

  it("the redraw after a batch shows an arrival the queue never walked", async () => {
    const { builder } = build();
    const bug = unit("b1", "bug:swarmer", 4, 2);
    await builder.arrive(bug, TEMPLATES["bug:swarmer"]!, { x: 5, y: 0, z: 5 });
    expect(builder.unitObject("b1")?.visible).toBe(false);
    await builder.update([bug], TEMPLATES);
    expect(builder.unitObject("b1")?.visible).toBe(true);
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
// Tech carcasses (#1171)
// ===========================================

describe("TacticalSceneBuilder carcasses", () => {
  /** A carcass lying at the tile, or one already stripped. */
  function carcass(
    id: string,
    x: number,
    z: number,
    harvested = false,
  ): TechCarcass {
    return { id, pos: { x, y: 0, z }, techPoints: 10, harvested };
  }

  it("draws one model per unharvested carcass and loads the carcass model", async () => {
    const { builder, models } = build();
    await builder.updateCarcasses([carcass("c1", 1, 1), carcass("c2", 4, 4)]);
    expect(builder.carcassIds()).toEqual(["c1", "c2"]);
    expect(models.loads).toEqual([CARCASS_MODEL_ID, CARCASS_MODEL_ID]);
    expect(builder.carcassWorldPosition("c1")).toBeDefined();
  });

  it("never draws a harvested carcass, and removes one stripped later", async () => {
    const { builder } = build();
    await builder.updateCarcasses([
      carcass("c1", 1, 1),
      carcass("c2", 4, 4, true),
    ]);
    expect(builder.carcassIds()).toEqual(["c1"]);
    await builder.updateCarcasses([carcass("c1", 1, 1, true)]);
    expect(builder.carcassIds()).toEqual([]);
    expect(builder.carcassWorldPosition("c1")).toBeUndefined();
  });

  it("lays it on its own tile, where the tile picker still finds the tile", async () => {
    const { builder } = build();
    await builder.updateCarcasses([carcass("c1", 2, 3)]);
    const at = builder.carcassWorldPosition("c1");
    const tile = builder.tileWorldPosition({ x: 2, y: 0, z: 3 });
    expect(at).toBeDefined();
    expect(tile).toBeDefined();
    expect(at?.x).toBeCloseTo(tile?.x ?? -1);
    expect(at?.z).toBeCloseTo(tile?.z ?? -1);
  });

  it("dispose takes the carcasses down with everything else", async () => {
    const { builder } = build();
    await builder.updateCarcasses([carcass("c1", 1, 1)]);
    builder.dispose();
    expect(builder.carcassIds()).toEqual([]);
  });
});

// ===========================================
// Dropped specimens (#1179)
// ===========================================

describe("TacticalSceneBuilder dropped specimens", () => {
  /** A swarmer netted by `carrierId`, dropped where that squad fell at (x, z). */
  function dropped(carrierId: string, x: number, z: number): DroppedSpecimen {
    return {
      carrierId,
      pos: { x, y: 0, z },
      specimen: {
        unitId: "bug-1",
        species: "swarmer",
        templateId: "bug:swarmer",
        movePenalty: 1,
      },
    };
  }

  it("draws the specimen with its species' model, named by the fallen carrier", async () => {
    const { builder, models } = build();
    await builder.updateSpecimens([dropped("squad-1", 2, 3)], TEMPLATES);
    expect(builder.specimenIds()).toEqual(["squad-1"]);
    expect(models.loads).toEqual(["bug.swarmer"]);
    const drawn = builder.root.getObjectByName("specimen:squad-1");
    expect(drawn?.getObjectByName(SPECIMEN_NET_NAME)).toBeDefined();
  });

  it("takes it off the board once picked up, and down with everything on dispose", async () => {
    const { builder } = build();
    await builder.updateSpecimens(
      [dropped("squad-1", 2, 3), dropped("squad-2", 4, 4)],
      TEMPLATES,
    );
    await builder.updateSpecimens([dropped("squad-2", 4, 4)], TEMPLATES);
    expect(builder.specimenIds()).toEqual(["squad-2"]);
    expect(builder.root.getObjectByName("specimen:squad-1")).toBeUndefined();
    builder.dispose();
    expect(builder.specimenIds()).toEqual([]);
  });
});

// ===========================================
// Mech wrecks (arc §6.6)
// ===========================================

describe("TacticalSceneBuilder wrecks", () => {
  /** Anvil's wreck over the 3 × 3 square with its corner at (1, 1). */
  const WRECK: MechWreck = {
    id: "wreck-1",
    pos: { x: 2, y: 0, z: 2 },
    tiles: [1, 2, 3].flatMap((z) => [1, 2, 3].map((x) => ({ x, y: 0, z }))),
    mechName: "Anvil",
    loadout: STARTER_LOADOUT,
  };

  it("draws the lost mech from its loadout's parts, and leaves it out of the pick", async () => {
    const { builder, models } = build();
    await builder.updateWrecks([WRECK]);
    const assembly = mechAssemblyFor(STARTER_LOADOUT);
    expect(builder.wreckIds()).toEqual(["wreck-1"]);
    expect(models.loads).toContain(assembly.legs);
    expect(models.loads).toContain(assembly.armWeapon);
    const wreck = builder.root.getObjectByName(`${WRECK_NAME_PREFIX}wreck-1`);
    expect(wreck).toBeDefined();
    // Straight down onto its middle tile: the squad's wheel finds the
    // strip, and a click there must reach the tile, not a unit.
    expect(builder.pickUnit(ndcOf(2.5, 2.5), topDownCamera())).toBeUndefined();
  });

  it("removes a wreck gone from the list, and dispose takes the rest", async () => {
    const { builder } = build();
    await builder.updateWrecks([WRECK]);
    await builder.updateWrecks([]);
    expect(builder.wreckIds()).toEqual([]);
    await builder.updateWrecks([WRECK]);
    builder.dispose();
    expect(builder.wreckIds()).toEqual([]);
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

  // ===========================================
  // Spore pods (#1179)
  // ===========================================

  /** A standing spore pod at the tile. */
  function pod(id: string, x: number, z: number): Spawner {
    return { ...spawner(id, x, z), variant: "spore-pod", timer: 0 };
  }

  /** The model names drawn for a spawner: `box:<model id>` per mesh. */
  function drawn(builder: TacticalSceneBuilder): string[] {
    const names: string[] = [];
    builder.root.getObjectByName("spawners")?.traverse((part) => {
      if (part.name.startsWith("box:")) {
        names.push(part.name);
      }
    });
    return names;
  }

  it("draws a spore pod with its own model, beside an egg spawner", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([spawner("s1", 1, 1), pod("p1", 4, 4)]);
    expect(models.loads).toEqual([SPAWNER_MODEL_ID, "bug.spore-pod"]);
    expect(drawn(builder)).toEqual([
      "box:bug.egg-spawner",
      "box:bug.spore-pod",
    ]);
  });

  it("swaps a ripe pod's mature model in, and only a pod's", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([spawner("s1", 1, 1), pod("p1", 2, 3)]);
    await builder.updateSpawners(
      [spawner("s1", 1, 1), pod("p1", 2, 3)],
      new Set(["s1", "p1"]),
    );
    // An egg spawner has no ripe look: nothing reloads for it.
    expect(models.loads).toEqual([
      SPAWNER_MODEL_ID,
      "bug.spore-pod",
      "bug.spore-pod-mature",
    ]);
    expect(drawn(builder)).toEqual([
      "box:bug.egg-spawner",
      "box:bug.spore-pod-mature",
    ]);
    expect(builder.spawnerIds()).toEqual(["s1", "p1"]);
    // Still picked as the pod, from the new mesh.
    expect(builder.pickSpawner(ndcOf(2.5, 3.5), topDownCamera())).toBe("p1");
    // Asked again, it is already ripe: no reload.
    await builder.updateSpawners([pod("p1", 2, 3)], new Set(["p1"]));
    expect(models.loads).toHaveLength(3);
  });

  it("keeps the pod on the board while its ripe model loads", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([pod("p1", 2, 3)]);
    models.hold();
    const pending = builder.updateSpawners([pod("p1", 2, 3)], new Set(["p1"]));
    expect(drawn(builder)).toEqual(["box:bug.spore-pod"]);
    models.open();
    await pending;
    expect(drawn(builder)).toEqual(["box:bug.spore-pod-mature"]);
  });

  it("never lets a late ripe load replace the model the pod wears now", async () => {
    // The mature model is held; everything else loads at once.
    const inner = new FakeModelLoader();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const models: ModelLoader = {
      load: async (id) => {
        if (id === "bug.spore-pod-mature") {
          await gate;
        }
        return inner.load(id);
      },
      preload: () => inner.preload(),
    };
    const map = new FixtureMapBuilder(6, 6, 1).fillGround().build();
    const builder = new TacticalSceneBuilder({ map, models });
    await builder.updateSpawners([pod("p1", 2, 3)]);
    const ripening = builder.updateSpawners([pod("p1", 2, 3)], new Set(["p1"]));
    // Before the mature model arrives, the pod is closed again (a
    // reload that set the clock back, say).
    await builder.updateSpawners([pod("p1", 2, 3)]);
    release();
    await ripening;
    expect(drawn(builder)).toEqual(["box:bug.spore-pod"]);
  });

  // ===========================================
  // Hive core (#1179)
  // ===========================================

  /** A standing 3×3 hive core anchored at the tile, with `hp` of 90. */
  function core(id: string, x: number, z: number, hp = 90): Spawner {
    return {
      ...spawner(id, x, z),
      variant: "hive-core",
      hp,
      maxHp: 90,
      timer: 0,
    };
  }

  it("stands the hive core in the middle of its 3×3 footprint", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([core("c1", 1, 1), spawner("s1", 5, 5)]);

    expect(models.loads).toEqual(["bug.hive-core", SPAWNER_MODEL_ID]);
    const middle = builder.spawnerWorldPosition("c1");
    expect(middle?.x).toBeCloseTo(2.5);
    expect(middle?.z).toBeCloseTo(2.5);
    // A one-tile spawner still stands on its own tile's centre.
    expect(builder.spawnerWorldPosition("s1")?.x).toBeCloseTo(5.5);
  });

  it("swaps the broken core in once it is below half its hit points", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([core("c1", 1, 1)]);
    await builder.updateSpawners([core("c1", 1, 1, 45)]);
    expect(drawn(builder)).toEqual(["box:bug.hive-core"]);

    await builder.updateSpawners([core("c1", 1, 1, 44)]);

    expect(drawn(builder)).toEqual(["box:bug.hive-core-damaged"]);
    expect(models.loads).toEqual(["bug.hive-core", "bug.hive-core-damaged"]);
    // Further damage keeps the broken model: no reload.
    await builder.updateSpawners([core("c1", 1, 1, 10)]);
    expect(models.loads).toHaveLength(2);
  });

  it("discards a ripe load the pod no longer wants", async () => {
    const { builder, models } = build();
    await builder.updateSpawners([pod("p1", 2, 3)]);
    models.hold();
    const pending = builder.updateSpawners([pod("p1", 2, 3)], new Set(["p1"]));
    // Wrecked before its mature model arrived.
    await builder.updateSpawners([]);
    models.open();
    await pending;
    expect(drawn(builder)).toEqual([]);
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

    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
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
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(0);
  });

  it("hangs a 2×2 unit's tether under the middle of its footprint, not its anchor tile (#1130)", async () => {
    const { builder } = tetherScene();
    await builder.update(
      [
        {
          ...unit("b1", "bug:brute", 2, 2),
          pos: { x: 2, y: STOREY_LAYERS, z: 2 },
        },
      ],
      TEMPLATES,
    );
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    const line = tethersIn(builder).get("b1");
    expect(line?.position.x).toBeCloseTo(3);
    expect(line?.position.z).toBeCloseTo(3);
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
    builder.setLayerFocus({ storey: 0, storeyCount: 3 });
    const line = tethersIn(builder).get("u1");
    // Ground at layer 0, not the cut-away first floor at layer 2.
    expect(line?.scale.y).toBeCloseTo(tileTop(2 * STOREY_LAYERS) - tileTop(0));
  });

  // The case that bit #978: a roof tile carries its building and no
  // `floorIndex`, and every fixture written for that change had floors
  // and no roof. This code reads the same predicate, so it gets a roof.
  it("tethers a unit standing on a roof the cut has taken away", async () => {
    const b = new FixtureMapBuilder(6, 6, 8).fillGround();
    b.building(tetherBuilding("b", 0, 2));
    for (let floor = 0; floor < 2; floor++) {
      b.tile({ x: 2, y: floor * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
        buildingId: "b",
        floorIndex: floor,
      });
    }
    // Walkable roof: the building, no floor index, as generated maps emit.
    b.tile({ x: 2, y: 2 * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
      buildingId: "b",
    });
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
    // Cut to the ground floor: the roof is gone, so the unit on it is
    // unsupported and the line lands on the ground.
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    const line = tethersIn(builder).get("u1");
    expect(line?.scale.y).toBeCloseTo(tileTop(2 * STOREY_LAYERS) - tileTop(0));
  });

  // The interaction with #996/#1013's roof correction. Before that fix a
  // roof's storey exceeded the top focus, so a unit standing on one was
  // "unsupported" in the default view and drew a tether over a roof
  // that was right there under its feet.
  it("leaves a roof-standing unit alone at the top storey", async () => {
    const b = new FixtureMapBuilder(6, 6, 8).fillGround();
    b.building(tetherBuilding("b", 0, 2));
    for (let floor = 0; floor < 2; floor++) {
      b.tile({ x: 2, y: floor * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
        buildingId: "b",
        floorIndex: floor,
      });
    }
    b.tile({ x: 2, y: 2 * STOREY_LAYERS, z: 2 }, SurfaceIds.FLOOR, {
      buildingId: "b",
    });
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
    // The view the scene opens on: the roof is drawn, so no tether.
    builder.setLayerFocus({ storey: 1, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(0);
    // And one appears the moment the player actually cuts below it.
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(1);
  });

  it("retires the line when the cut rises back over the unit", async () => {
    const { builder } = tetherScene();
    await builder.update([upstairs()], TEMPLATES);
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(1);
    builder.setLayerFocus({ storey: 1, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(0);
  });

  it("retires the line when the unit dies", async () => {
    const { builder } = tetherScene();
    await builder.update([upstairs()], TEMPLATES);
    builder.setLayerFocus({ storey: 0, storeyCount: 2 });
    expect(tethersIn(builder).size).toBe(1);
    await builder.update([{ ...upstairs(), hp: 0 }], TEMPLATES);
    expect(tethersIn(builder).size).toBe(0);
  });
});

// ===========================================
// Footprints (#1130)
// ===========================================

describe("TacticalSceneBuilder footprints", () => {
  it("stands a 2×2 unit on the corner its four tiles share, twice the size, and picks it anywhere on the block", async () => {
    const { builder } = build();
    await builder.update(
      [unit("u1", "squad:squad-1", 0, 0), unit("b1", "bug:block", 2, 2)],
      TEMPLATES,
    );
    // Anchor (2, 2): the block is (2..3, 2..3), centred on (3, 3).
    expect(builder.unitWorldPosition("b1")).toEqual({
      x: 3,
      y: SLAB_HEIGHT,
      z: 3,
    });
    // The one-tile unit beside it is exactly where it always was.
    expect(builder.unitWorldPosition("u1")).toEqual({
      x: 0.5,
      y: SLAB_HEIGHT,
      z: 0.5,
    });
    // The fake model is a 1 u box; at footprint 2 the unit is 2 u tall.
    expect(builder.unitHeight("b1")).toBeCloseTo(2);
    expect(builder.unitHeight("u1")).toBeCloseTo(1);
    const camera = topDownCamera();
    // The model spans the block (0.8 u box ×2 = 1.6 u, centred on 3, 3),
    // so a click on any of its four tiles lands on it.
    expect(builder.pickUnit(ndcOf(3, 3), camera)).toBe("b1");
    expect(builder.pickUnit(ndcOf(2.4, 2.4), camera)).toBe("b1");
    expect(builder.pickUnit(ndcOf(3.6, 3.6), camera)).toBe("b1");
    expect(builder.pickUnit(ndcOf(1.5, 1.5), camera)).toBeUndefined();
  });

  it("draws a 2×2 unit whose art was authored at its footprint at unit scale (#1134)", async () => {
    const { builder } = build();
    await builder.update([unit("b1", "bug:brute", 2, 2)], TEMPLATES);
    // The stub model is one unit tall; the brute's manifest footprint is
    // 2×2, so nothing multiplies it.
    expect(builder.unitHeight("b1")).toBeCloseTo(1);
  });

  it("answers where a unit's feet go on any tile, sized to that unit's footprint", async () => {
    const { builder } = build();
    await builder.update(
      [unit("u1", "squad:squad-1", 0, 0), unit("b1", "bug:brute", 2, 2)],
      TEMPLATES,
    );
    const tile = { x: 1, y: 0, z: 4 };
    expect(builder.unitWorldPositionAt("u1", tile)).toEqual({
      x: 1.5,
      y: SLAB_HEIGHT,
      z: 4.5,
    });
    expect(builder.unitWorldPositionAt("b1", tile)).toEqual({
      x: 2,
      y: SLAB_HEIGHT,
      z: 5,
    });
    // Off the map, or for a unit the scene does not have: nothing.
    expect(
      builder.unitWorldPositionAt("b1", { x: 9, y: 0, z: 9 }),
    ).toBeUndefined();
    expect(builder.unitWorldPositionAt("ghost", tile)).toBeUndefined();
  });

  it("knows a loading unit's footprint before its model has arrived, and forgets a removed one", async () => {
    const { builder, models } = build();
    models.hold();
    const pending = builder.update([unit("b1", "bug:brute", 2, 2)], TEMPLATES);
    expect(builder.unitWorldPositionAt("b1", { x: 0, y: 0, z: 0 })).toEqual({
      x: 1,
      y: SLAB_HEIGHT,
      z: 1,
    });
    models.open();
    await pending;
    await builder.update([], TEMPLATES);
    expect(
      builder.unitWorldPositionAt("b1", { x: 0, y: 0, z: 0 }),
    ).toBeUndefined();
  });

  it("re-poses a moved 2×2 unit to its new footprint centre", async () => {
    const { builder } = build();
    await builder.update([unit("b1", "bug:brute", 2, 2)], TEMPLATES);
    await builder.update(
      [{ ...unit("b1", "bug:brute", 0, 1), facing: "s" }],
      TEMPLATES,
    );
    expect(builder.unitWorldPosition("b1")).toEqual({
      x: 1,
      y: SLAB_HEIGHT,
      z: 2,
    });
  });
});

describe("TacticalSceneBuilder marks under the storey cut (#1134)", () => {
  const groundFloor = { x: 2, y: 0, z: 2 };
  const firstFloor = { x: 2, y: STOREY_LAYERS, z: 2 };
  const cutToGround = { storey: 0, storeyCount: 2 };
  const uncut = { storey: 1, storeyCount: 2 };

  it("answers the map view's cut for a tile", () => {
    const { builder } = tetherScene();
    expect(builder.isCut(firstFloor)).toBe(false);
    builder.setLayerFocus(cutToGround);
    expect(builder.isCut(firstFloor)).toBe(true);
    expect(builder.isCut(groundFloor)).toBe(false);
    builder.setLayerFocus(uncut);
    expect(builder.isCut(firstFloor)).toBe(false);
  });

  it("withholds a charge marker on a peeled floor and redraws it when the view rises", () => {
    const { builder } = tetherScene();
    const charges = [
      {
        id: "c-low",
        ownerId: "u1",
        equipmentId: "breaching-charge",
        tile: groundFloor,
        detonatesOnTurn: 2,
      },
      {
        id: "c-high",
        ownerId: "u1",
        equipmentId: "breaching-charge",
        tile: firstFloor,
        detonatesOnTurn: 2,
      },
    ];
    builder.updateCharges(charges);
    expect(builder.chargeIds()).toEqual(["c-low", "c-high"]);
    builder.setLayerFocus(cutToGround);
    expect(builder.chargeIds()).toEqual(["c-low"]);
    // A refresh from state while cut keeps the rule.
    builder.updateCharges(charges);
    expect(builder.chargeIds()).toEqual(["c-low"]);
    builder.setLayerFocus(uncut);
    expect(builder.chargeIds()).toEqual(["c-low", "c-high"]);
  });

  it("withholds a radar blip on a peeled floor and redraws it when the view rises", async () => {
    const { builder } = tetherScene();
    const contacts = [
      { kind: "unit" as const, pos: groundFloor },
      { kind: "structure" as const, pos: firstFloor },
    ];
    await builder.updateRadar([], contacts);
    expect(builder.radarCounts().contacts).toBe(2);
    builder.setLayerFocus(cutToGround);
    expect(builder.radarCounts().contacts).toBe(1);
    builder.setLayerFocus(uncut);
    expect(builder.radarCounts().contacts).toBe(2);
  });

  it("draws objective hook slabs only when asked, as the mapgen preview does", () => {
    const map = new FixtureMapBuilder(6, 6, 1)
      .fillGround()
      .deploy([{ x: 0, y: 0, z: 0 }])
      .objective(HookKinds.SPORE_POD, [{ x: 3, y: 0, z: 3 }])
      .build();
    const slabs = (builder: TacticalSceneBuilder): string[] => {
      const names: string[] = [];
      builder.root.traverse((object) => {
        if (object.name.startsWith("hooks:hook:")) names.push(object.name);
      });
      return names;
    };
    const mission = new TacticalSceneBuilder({
      map,
      models: new FakeModelLoader(),
    });
    const preview = new TacticalSceneBuilder({
      map,
      models: new FakeModelLoader(),
      objectiveMarkers: true,
    });
    expect(slabs(mission)).toContain("hooks:hook:deploy:0");
    expect(slabs(mission).some((n) => n.includes("spore-pod"))).toBe(false);
    expect(slabs(preview)).toContain("hooks:hook:spore-pod:0");
    mission.dispose();
    preview.dispose();
  });

  it("withholds an objective marker on a peeled floor and redraws it when the view rises (#1173)", () => {
    const { builder } = tetherScene();
    const markers = [
      { objectiveId: "o-low", pos: groundFloor },
      { objectiveId: "o-high", pos: firstFloor },
    ];
    builder.updateObjectiveMarkers(markers);
    expect(builder.objectiveMarkerCount()).toBe(2);
    builder.setLayerFocus(cutToGround);
    expect(builder.objectiveMarkerCount()).toBe(1);
    // A refresh from state while cut keeps the rule.
    builder.updateObjectiveMarkers(markers);
    expect(builder.objectiveMarkerCount()).toBe(1);
    builder.setLayerFocus(uncut);
    expect(builder.objectiveMarkerCount()).toBe(2);
    builder.dispose();
    expect(builder.objectiveMarkerCount()).toBe(0);
  });
});
