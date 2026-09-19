import { Box3, BoxGeometry, Group, Mesh, Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { ModelLoader } from "../model/model-loader";
import {
  MODULE_MODEL_NAME,
  NODE_MODEL_EXTENT,
  TechNodeModelSource,
} from "./tech-node-model-source";

/** Hands out a box of a chosen size per id, remembering what was asked for. */
class FakeModelLoader implements ModelLoader {
  readonly loads: ModelAssetId[] = [];

  load(id: ModelAssetId): Promise<Object3D> {
    this.loads.push(id);
    const group = new Group();
    group.name = id;
    // A tall thin thing, off-centre and floating, to prove the normaliser works.
    const mesh = new Mesh(new BoxGeometry(0.5, 4, 0.5));
    mesh.position.set(3, 5, -2);
    group.add(mesh);
    return Promise.resolve(group);
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }
}

function bounds(object: Object3D): Box3 {
  object.updateMatrixWorld(true);
  return new Box3().setFromObject(object);
}

describe("TechNodeModelSource", () => {
  it("loads a single model, scales its longest side to the node extent and stands it on the origin", async () => {
    const loader = new FakeModelLoader();
    const model = await new TechNodeModelSource({ models: loader }).modelFor([
      "legs-jumper",
    ]);
    expect(loader.loads).toEqual(["tdf.mech.legs.jumper"]);
    const box = bounds(model);
    const size = box.getSize(new Vector3());
    expect(size.y).toBeCloseTo(NODE_MODEL_EXTENT, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
    const centre = box.getCenter(new Vector3());
    expect(centre.x).toBeCloseTo(0, 5);
    expect(centre.z).toBeCloseTo(0, 5);
  });

  it("loads both arms of a pair and stands them side by side", async () => {
    const loader = new FakeModelLoader();
    const model = await new TechNodeModelSource({ models: loader }).modelFor([
      "arms-marksman",
    ]);
    expect(loader.loads).toEqual([
      "tdf.mech.arms.marksman-l",
      "tdf.mech.arms.marksman-r",
    ]);
    const size = bounds(model).getSize(new Vector3());
    // Two arms apart are wider than one arm, and the pair is still normalised to the extent.
    expect(size.x).toBeGreaterThan(size.z);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(NODE_MODEL_EXTENT, 5);
  });

  it("draws a utility, or anything without a model, as the generic module without loading", async () => {
    const loader = new FakeModelLoader();
    const source = new TechNodeModelSource({ models: loader });
    const model = await source.modelFor(["utility-recon-sensor"]);
    expect(loader.loads).toEqual([]);
    expect(model.getObjectByName(MODULE_MODEL_NAME)).toBeDefined();
    expect(bounds(model).min.y).toBeCloseTo(0, 5);
  });

  it("skips parts without a model to draw the first one that has one", async () => {
    const loader = new FakeModelLoader();
    await new TechNodeModelSource({ models: loader }).modelFor([
      "utility-composite-plating",
      "chassis-atlas",
    ]);
    expect(loader.loads).toEqual(["tdf.mech.chassis.atlas"]);
  });
});
