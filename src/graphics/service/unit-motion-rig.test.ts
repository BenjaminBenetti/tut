/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, Vector3 } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { MODEL_MANIFEST } from "../data/model-manifest";
import { mechAssemblyFor } from "../data/part-model-table";
import type { ModelLoader } from "../model/model-loader";
import { UnitMesh } from "../view/unit-mesh";
import { flattenModel } from "./loadout-unit-model-source";
import { MechAssembler } from "./mech-assembler";

const MODELS = [
  "tdf.infantry.rifle",
  "tdf.infantry.rocket",
  "tdf.infantry.sniper",
  "tdf.infantry.engineer",
  "tdf.infantry.medic",
  "tdf.mech.assembled-a",
  "tdf.mech.assembled-b",
  "bug.swarmer",
  "bug.lurker",
  "bug.brute",
] as const;

/** Loads real geometry and node transforms, omitting browser-only image decoding. */
async function loadModel(id: ModelAssetId): Promise<Object3D> {
  const source = readFileSync(`public/${MODEL_MANIFEST[id].path}`);
  const length = source.readUInt32LE(12);
  const json = JSON.parse(
    source.subarray(20, 20 + length).toString(),
  ) as Record<string, unknown>;
  delete json.images;
  delete json.textures;
  delete json.materials;
  for (const mesh of json.meshes as { primitives: { material?: number }[] }[]) {
    for (const primitive of mesh.primitives) delete primitive.material;
  }
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const bin = source.subarray(20 + length);
  const glb = Buffer.alloc(20 + padded + bin.length, 0x20);
  source.copy(glb, 0, 0, 20);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded, 12);
  encoded.copy(glb, 20);
  bin.copy(glb, 20 + padded);
  return (await new GLTFLoader().parseAsync(glb.buffer, "")).scene;
}

/** Captures world transforms of renderable parts, excluding the floor markers. */
function pose(model: Object3D): number[][] {
  model.updateWorldMatrix(true, true);
  const values: number[][] = [];
  model.traverse((part) => {
    if (part instanceof Mesh) values.push([...part.matrixWorld.elements]);
  });
  return values;
}

describe("unit motion on the shipped models", () => {
  it.each(MODELS)(
    "animates and restores %s without changing its prototype or floor markers",
    async (id) => {
      const prototype = await loadModel(id);
      const original = pose(prototype);
      const clone = prototype.clone(true);
      const mesh = new UnitMesh("actor", clone, id);
      mesh.setPose({ x: 3, y: 2, z: 5 }, "e");
      mesh.setHighlight({ selected: true, hovered: true });
      const rest = pose(clone);
      const root = mesh.object.position.clone();
      const ring = mesh.object.getObjectByName("selection-ring")!;
      const ringPose = ring.position.clone();
      const base = clone.getObjectByName("base");
      const basePosition = base?.position.clone();
      mesh.motion!.walk(0.13);
      expect(pose(clone)).not.toEqual(rest);
      expect(mesh.object.position).toEqual(root);
      expect(ring.position).toEqual(ringPose);
      expect(base?.position).toEqual(basePosition);
      mesh.motion!.reset();
      expect(pose(clone)).toEqual(rest);
      mesh.motion!.attack(0.35, id.startsWith("bug."));
      expect(pose(clone)).not.toEqual(rest);
      mesh.motion!.attack(1, id.startsWith("bug."));
      expect(pose(clone)).toEqual(rest);
      expect(pose(prototype)).toEqual(original);
      expect(clone.getObjectsByProperty("name", "motion-body")).toHaveLength(1);
      // A rig must move limbs, not just bob an otherwise frozen model.
      const legs: Object3D[] = [];
      clone.traverse((part) => {
        if (part.name.startsWith("motion-leg-")) legs.push(part);
      });
      expect(legs.length).toBeGreaterThanOrEqual(
        id.startsWith("tdf.infantry") ? 10 : 2,
      );
      if (id.startsWith("bug.")) {
        // Crescent bugs have four running legs and two independently
        // grouped blade arms. Joining the sculpt into one mesh must fail.
        expect(legs).toHaveLength(4);
        const arms: Object3D[] = [];
        clone.traverse((part) => {
          if (part.name.startsWith("motion-arm-")) arms.push(part);
        });
        expect(arms).toHaveLength(2);
        // Every limb's origin is its attachment. Rotation must keep it
        // at the pivot instead of orbiting around the limb's bounding box.
        for (const joint of [...legs, ...arms]) {
          expect(joint.children).toHaveLength(1);
          expect(joint.children[0]!.userData.motion_joint).toBe(true);
          expect(joint.children[0]!.position.length()).toBeLessThan(1e-6);
        }
        mesh.motion!.attack(0.35, true);
        expect(arms.every((arm) => Math.abs(arm.rotation.x) > 0.1)).toBe(true);
      }
      mesh.motion!.walk(0.13);
      expect(legs.some((leg) => leg.rotation.x > 0.1)).toBe(true);
      expect(legs.some((leg) => leg.rotation.x < -0.1)).toBe(true);
      mesh.dispose();
      expect(pose(clone)).toEqual(rest);
    },
  );

  it.each(MODELS)(
    "preserves %s's authored bounds when the rig is at rest",
    async (id) => {
      const model = await loadModel(id);
      const expected = model.clone(true);
      expected.rotateY(Math.PI);
      const before = new Box3().setFromObject(expected);
      if (id.startsWith("bug.")) {
        expect(before.min.y).toBeCloseTo(0, 3);
        expect(before.getSize(new Vector3()).y).toBeCloseTo(
          MODEL_MANIFEST[id].height,
          2,
        );
      }
      new UnitMesh("actor", model, id);
      const after = new Box3().setFromObject(model);
      expect(
        after.getSize(new Vector3()).distanceTo(before.getSize(new Vector3())),
      ).toBeLessThan(0.01);
      expect(
        after
          .getCenter(new Vector3())
          .distanceTo(before.getCenter(new Vector3())),
      ).toBeLessThan(0.01);
    },
  );
});

it.each([
  ["tdf.mech.assembled-a", "socket_muzzle"],
  // The leader kneels front-centre, and since #1132 every figure's upper
  // parts are joined into one `fig<N>_upper`, so the leader's torso is
  // the front marker where its rifle used to be.
  ["tdf.infantry.rifle", "fig0_upper"],
  ["bug.swarmer", "head"],
] as const)(
  "turns %s's actual front toward its tactical facing",
  async (id, front) => {
    const mesh = new UnitMesh("actor", await loadModel(id), id);
    for (const facing of ["n", "e", "s", "w"] as const) {
      mesh.setPose({ x: 0, y: 0, z: 0 }, facing);
      const point = mesh.object
        .getObjectByName(front)!
        .getWorldPosition(new Vector3());
      point.sub(mesh.object.position);
      if (facing === "n") expect(point.z).toBeLessThan(0);
      if (facing === "s") expect(point.z).toBeGreaterThan(0);
      if (facing === "e") expect(point.x).toBeGreaterThan(0);
      if (facing === "w") expect(point.x).toBeLessThan(0);
    }
  },
);

it.each(["tdf.mech.assembled-a", "tdf.mech.assembled-b"] as const)(
  "%s alternates its feet over two tiles at the slower cadence",
  async (id) => {
    const mesh = new UnitMesh("actor", await loadModel(id), id);
    const leg = mesh.object.getObjectByName("motion-leg-l")!;
    mesh.motion!.walk(0.5);
    const firstStep = leg.rotation.x;
    expect(firstStep).toBeGreaterThan(0.2);
    mesh.motion!.walk(1);
    expect(leg.rotation.x).toBeCloseTo(0);
    mesh.motion!.walk(1.5);
    expect(leg.rotation.x).toBeCloseTo(-firstStep);
    mesh.motion!.walk(2);
    expect(leg.rotation.x).toBeCloseTo(0);
  },
);

/** A mech assembled from the shipped part GLBs, as the battlefield draws one (#1115). */
async function assembledStarter(): Promise<Object3D> {
  const models: ModelLoader = {
    load: (id) => loadModel(id),
    preload: () => Promise.resolve(),
  };
  const assembler = new MechAssembler({ models });
  return flattenModel(
    await assembler.assemble(mechAssemblyFor(STARTER_LOADOUT)),
  );
}

describe("unit motion on a mech assembled from its loadout (#1115)", () => {
  it("finds both legs and the weapon arm, and walks like the reference", async () => {
    const model = await assembledStarter();
    const mesh = new UnitMesh("actor", model, "tdf.mech.assembled-a");
    const rest = pose(model);
    const legs: Object3D[] = [];
    const arms: Object3D[] = [];
    model.traverse((part) => {
      if (part.name.startsWith("motion-leg-")) legs.push(part);
      if (part.name.startsWith("motion-arm-")) arms.push(part);
    });
    expect(legs.map((leg) => leg.name).sort()).toEqual([
      "motion-leg-l",
      "motion-leg-r",
    ]);
    expect(arms.length).toBeGreaterThanOrEqual(1);
    mesh.motion!.walk(0.5);
    expect(pose(model)).not.toEqual(rest);
    expect(legs.some((leg) => leg.rotation.x > 0.1)).toBe(true);
    expect(legs.some((leg) => leg.rotation.x < -0.1)).toBe(true);
    mesh.motion!.reset();
    expect(pose(model)).toEqual(rest);
    mesh.motion!.attack(0.35, false);
    expect(pose(model)).not.toEqual(rest);
    mesh.motion!.reset();
    expect(pose(model)).toEqual(rest);
  });

  it("stands as tall as the reference assembly and faces the same way", async () => {
    const assembled = await assembledStarter();
    const reference = await loadModel("tdf.mech.assembled-a");
    const mesh = new UnitMesh("actor", assembled, "tdf.mech.assembled-a");
    const referenceMesh = new UnitMesh(
      "reference",
      reference,
      "tdf.mech.assembled-a",
    );
    const height = (model: Object3D): number =>
      new Box3().setFromObject(model).getSize(new Vector3()).y;
    // Same legs and chassis, so the same height within a hand's width.
    expect(Math.abs(height(assembled) - height(reference))).toBeLessThan(0.15);
    for (const facing of ["n", "e", "s", "w"] as const) {
      mesh.setPose({ x: 0, y: 0, z: 0 }, facing);
      referenceMesh.setPose({ x: 0, y: 0, z: 0 }, facing);
      const muzzle = mesh.object
        .getObjectByName("socket_muzzle")!
        .getWorldPosition(new Vector3())
        .sub(mesh.object.position);
      const expected = referenceMesh.object
        .getObjectByName("socket_muzzle")!
        .getWorldPosition(new Vector3())
        .sub(referenceMesh.object.position);
      expect(Math.sign(muzzle.x)).toBe(Math.sign(expected.x));
      expect(Math.sign(muzzle.z)).toBe(Math.sign(expected.z));
    }
  });
});
