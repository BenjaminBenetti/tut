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

import type { ModelAssetId } from "../../content/data/model-ids";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { LEVEL_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import type { ModelLoader } from "../model/model-loader";
import { TacticalSceneBuilder } from "./tactical-scene-builder";

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
    weapon: { range: 5, accuracy: 60, damage: 3, armorPen: 0 },
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
    expect(LEVEL_HEIGHT).toBeGreaterThan(0);
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
