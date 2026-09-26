/// <reference types="node" />
import { readFileSync } from "node:fs";
import { Box3, Mesh, Vector3 } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import type { ModelAssetId } from "../../content/data/model-ids";
import { MECH_BLUEPRINTS } from "../../roster/data/mech-blueprints";
import { STARTER_PARTS } from "../../roster/data/parts";
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
  "bug.spitter",
  "civ.group",
  "bug.swarmer-armoured",
  "bug.lurker-armoured",
  "bug.brute-armoured",
] as const;

/**
 * The Act III armoured variants (#1179), each beside the species whose
 * anatomy it wears: same rig nodes and pivots, so the same gait.
 */
const ARMOURED = [
  ["bug.swarmer-armoured", "bug.swarmer"],
  ["bug.lurker-armoured", "bug.lurker"],
  ["bug.brute-armoured", "bug.brute"],
] as const;

/**
 * Bugs that never walk (#1179): the Hive Guard is rooted to its chamber,
 * so it has no legs for a walk cycle to swing, only arms to recoil.
 */
const ROOTED = ["bug.hive-guard"] as const;

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
      // Five soldiers walk on ten legs; the four townspeople of a
      // civilian group (campaign arc §6.4) on eight.
      expect(legs.length).toBeGreaterThanOrEqual(
        id.startsWith("tdf.infantry") ? 10 : id === "civ.group" ? 8 : 2,
      );
      if (id.startsWith("bug.")) {
        // Crescent bugs have four running legs and two independently
        // grouped blade arms; the beetle brute walks on six since #1134,
        // and the spitter (#1179) has no blades at all: it spits, and
        // its shot plays as the body's recoil. An armoured variant has
        // its base's limbs. Joining the sculpt into one mesh must fail.
        expect(legs).toHaveLength(id.startsWith("bug.brute") ? 6 : 4);
        const arms: Object3D[] = [];
        clone.traverse((part) => {
          if (part.name.startsWith("motion-arm-")) arms.push(part);
        });
        expect(arms).toHaveLength(id === "bug.spitter" ? 0 : 2);
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

  it.each([...MODELS, ...ROOTED])(
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

describe("unit motion on a rooted bug (#1179)", () => {
  it.each(ROOTED)(
    "gives %s no legs to walk on and two spine racks that recoil and restore",
    async (id) => {
      const prototype = await loadModel(id);
      const original = pose(prototype);
      const clone = prototype.clone(true);
      const mesh = new UnitMesh("actor", clone, id);
      mesh.setPose({ x: 3, y: 2, z: 5 }, "e");
      const rest = pose(clone);
      const root = mesh.object.position.clone();
      const named = (prefix: string): Object3D[] => {
        const found: Object3D[] = [];
        clone.traverse((part) => {
          if (part.name.startsWith(prefix)) found.push(part);
        });
        return found;
      };
      // Its roots are part of the body: nothing for a walk cycle to swing.
      expect(named("motion-leg-")).toHaveLength(0);
      expect(clone.getObjectsByProperty("name", "motion-body")).toHaveLength(1);
      const arms = named("motion-arm-");
      expect(arms.map((arm) => arm.name).sort()).toEqual([
        "motion-arm-l",
        "motion-arm-r",
      ]);
      // Each rack pivots on its authored joint at the rack's root.
      for (const joint of arms) {
        expect(joint.children).toHaveLength(1);
        expect(joint.children[0]!.userData.motion_joint).toBe(true);
        expect(joint.children[0]!.position.length()).toBeLessThan(1e-6);
      }
      // A volley kicks both racks back, and the pose comes home after.
      mesh.motion!.attack(0.35, true);
      expect(arms.every((arm) => Math.abs(arm.rotation.x) > 0.1)).toBe(true);
      expect(mesh.object.position).toEqual(root);
      mesh.motion!.attack(1, true);
      expect(pose(clone)).toEqual(rest);
      expect(pose(prototype)).toEqual(original);
      mesh.dispose();
      expect(pose(clone)).toEqual(rest);
    },
  );
});

/** Every joint the rig built, by name, with its current local rotation. */
function jointRotations(model: Object3D): Record<string, number[]> {
  const joints: Record<string, number[]> = {};
  model.traverse((part) => {
    if (/^motion-(?:leg|arm)-/.test(part.name)) {
      joints[part.name] = [part.rotation.x, part.rotation.y, part.rotation.z];
    }
  });
  return joints;
}

describe("unit motion on the armoured variants (#1179)", () => {
  it.each(ARMOURED)(
    "walks and strikes %s exactly as its base %s",
    async (variant, base) => {
      const armoured = new UnitMesh(
        "variant",
        await loadModel(variant),
        variant,
      );
      const plain = new UnitMesh("base", await loadModel(base), base);
      // The same legs and blades, found under the same names.
      expect(Object.keys(jointRotations(armoured.object)).sort()).toEqual(
        Object.keys(jointRotations(plain.object)).sort(),
      );
      // Mid-stride, every leg and arm swings through the base's angle:
      // the swarmer's variant keeps the swarmer's longer stride.
      for (const strides of [0.13, 0.37, 0.8]) {
        armoured.motion!.walk(strides);
        plain.motion!.walk(strides);
        const moving = jointRotations(armoured.object);
        expect(Object.values(moving).some(([x]) => Math.abs(x!) > 0.1)).toBe(
          true,
        );
        expect(moving).toEqual(jointRotations(plain.object));
      }
      armoured.motion!.attack(0.35, true);
      plain.motion!.attack(0.35, true);
      expect(jointRotations(armoured.object)).toEqual(
        jointRotations(plain.object),
      );
      armoured.dispose();
      plain.dispose();
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
  ["bug.swarmer-armoured", "head"],
  // A rooted guard never walks, so turning toward its target is the only
  // way it aims (#1179): its head behind the shield must lead.
  ["bug.hive-guard", "head"],
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

describe("progression mech articulation", () => {
  const models: ModelLoader = {
    load: loadModel,
    preload: () => Promise.resolve(),
  };
  const assembler = new MechAssembler({ models });

  it.each(MECH_BLUEPRINTS)(
    "walks both legs of $name while keeping the back weapon on the torso",
    async (loadout) => {
      const model = flattenModel(
        await assembler.assemble(mechAssemblyFor(loadout)),
      );
      const mesh = new UnitMesh("actor", model, "tdf.mech.assembled-a");
      const back = model
        .getObjectByName("motion-body")!
        .children.filter((part) => part.userData.motion_role === "back");
      expect(back.length).toBeGreaterThan(0);
      const relative = back.map((part) => part.position.clone());
      mesh.motion!.walk(0.5);
      expect(model.getObjectByName("motion-leg-l")!.rotation.x).toBeGreaterThan(
        0.2,
      );
      expect(model.getObjectByName("motion-leg-r")!.rotation.x).toBeLessThan(
        -0.2,
      );
      expect(back.map((part) => part.position)).toEqual(relative);
      if (loadout.legsId === "legs-jumper") {
        expect(model.getObjectByName("nozzle_l")?.parent?.name).toBe(
          "motion-leg-l",
        );
        expect(model.getObjectByName("nozzle_tip_r")?.parent?.name).toBe(
          "motion-leg-r",
        );
      }
      mesh.motion!.attack(0.35, false);
      expect(back.map((part) => part.position)).toEqual(relative);
      expect(model.getObjectByName("motion-arm-r")!.children).toHaveLength(1);
    },
  );

  it("deploys both anchor spades, retains them through recoil, then restores them for walking", async () => {
    const model = flattenModel(
      await assembler.assemble(
        mechAssemblyFor({ ...STARTER_LOADOUT, legsId: "legs-anchor" }),
      ),
    );
    const mesh = new UnitMesh("actor", model, "tdf.mech.assembled-a");
    const rest = pose(model);
    const left = model.getObjectByName("motion-brace-l")!;
    const right = model.getObjectByName("motion-brace-r")!;
    expect(left.parent?.name).toBe("motion-leg-l");
    mesh.motion!.brace!(0.5);
    expect(left.rotation.z).toBeLessThan(0);
    expect(right.rotation.z).toBeGreaterThan(0);
    const partial = right.rotation.z;
    mesh.motion!.brace!(1);
    expect(right.rotation.z).toBeGreaterThan(partial);
    const deployed = pose(model);
    mesh.motion!.attack(0.35, false);
    mesh.motion!.reset();
    expect(pose(model)).toEqual(deployed);
    mesh.motion!.brace!(0);
    expect(pose(model)).toEqual(rest);
    mesh.motion!.walk(0.5);
    expect(left.parent!.rotation.x).toBeGreaterThan(0.2);
    expect(left.rotation.z).toBeCloseTo(0);
  });

  it.each(STARTER_PARTS.filter((part) => part.slot === "chassis"))(
    "connects every back module to $name's mounting hardware",
    async (chassis) => {
      for (const weapon of STARTER_PARTS.filter(
        (part) => part.slot === "back-weapon",
      )) {
        const model = flattenModel(
          await assembler.assemble(
            mechAssemblyFor({
              ...STARTER_LOADOUT,
              chassisId: chassis.id,
              backWeaponId: weapon.id,
            }),
          ),
        );
        const hardware = new Box3();
        const mount = new Box3();
        const cockpit = new Box3();
        const equipment = new Box3();
        model.traverse((node) => {
          if (node.name === "cockpit")
            cockpit.union(new Box3().setFromObject(node));
          if (node instanceof Mesh && node.userData.motion_role === "back")
            equipment.union(new Box3().setFromObject(node));
          if (node.name.startsWith("back_mount"))
            hardware.union(new Box3().setFromObject(node));
          if (node.name === "mount" && node.userData.motion_role === "back")
            mount.union(new Box3().setFromObject(node));
        });
        expect(hardware.isEmpty(), chassis.id).toBe(false);
        expect(mount.isEmpty(), weapon.id).toBe(false);
        expect(cockpit.isEmpty(), chassis.id).toBe(false);
        expect(
          equipment.min.x,
          `${chassis.id} / ${weapon.id} clears the cockpit`,
        ).toBeGreaterThan(cockpit.max.x);
        expect(
          hardware.intersectsBox(mount),
          `${chassis.id} / ${weapon.id}`,
        ).toBe(true);
      }
    },
  );
});
