import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } from "three";
import type { Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../tactical/model/unit-weapon";
import { mechAssemblyFor } from "../data/part-model-table";
import type { ModelLoader } from "../model/model-loader";
import { MECH_ROOT_NAME, MechAssembler } from "./mech-assembler";
import {
  flattenModel,
  LoadoutUnitModelSource,
} from "./loadout-unit-model-source";

// ===========================================
// Fixtures
// ===========================================

/** Sockets each stand-in part carries, as the shipped parts do. */
const SOCKETS: Partial<Record<ModelAssetId, string[]>> = {
  "tdf.mech.legs-a": ["socket_chassis"],
  "tdf.mech.chassis-a": ["socket_arm_l", "socket_arm_r", "socket_back"],
  "tdf.mech.arms.manipulator-l": ["socket_weapon"],
  "tdf.mech.arms.manipulator-r": ["socket_weapon"],
  "tdf.mech.weapon-arm.autocannon": ["socket_muzzle"],
  "tdf.mech.weapon-back.missile-pod": ["socket_muzzle"],
};

/** Loads a named group per id with one mesh and that model's sockets, counting loads. */
class FakeModelLoader implements ModelLoader {
  readonly loads: ModelAssetId[] = [];

  load(id: ModelAssetId): Promise<Object3D> {
    this.loads.push(id);
    const group = new Group();
    group.name = id;
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    mesh.name = `mesh:${id}`;
    group.add(mesh);
    for (const [index, socket] of (SOCKETS[id] ?? []).entries()) {
      const empty = new Group();
      empty.name = socket;
      // Offset sockets, so a flattened part must carry its socket's offset.
      empty.position.set(0, 1 + index, 0);
      group.add(empty);
    }
    return Promise.resolve(group);
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }
}

function template(loadout?: UnitTemplate["loadout"]): UnitTemplate {
  return {
    id: "mech:mech-1",
    name: "Hammerhead",
    maxHp: 80,
    maxAp: 2,
    move: 8,
    weapons: [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: { range: 10, accuracy: 70, damage: 40, armorPen: 2 },
      },
    ],
    sightRange: 14,
    armor: 9,
    passClass: "mech",
    modelId: "tdf.mech.assembled-a",
    ...(loadout === undefined ? {} : { loadout }),
  };
}

/** Names of every node under `root`, sorted. */
function names(root: Object3D): string[] {
  const found: string[] = [];
  root.traverse((node) => {
    if (node !== root) {
      found.push(node.name);
    }
  });
  return found.sort();
}

// ===========================================
// Tests
// ===========================================

describe("LoadoutUnitModelSource (#1115)", () => {
  it("assembles a mech from the parts its loadout names, not the reference assembly", async () => {
    const models = new FakeModelLoader();
    const source = new LoadoutUnitModelSource({ models });
    const mech = await source.load(template(STARTER_LOADOUT));
    const assembly = mechAssemblyFor(STARTER_LOADOUT);
    // Every part the table resolves the loadout to, and nothing else.
    expect([...models.loads].sort()).toEqual(
      [
        assembly.legs,
        assembly.chassis,
        assembly.armLeft,
        assembly.armRight,
        assembly.armWeapon,
        assembly.backWeapon,
      ].sort(),
    );
    expect(models.loads).not.toContain("tdf.mech.assembled-a");
    expect(mech.name).toBe(MECH_ROOT_NAME);
    // Arms retain their socket-mounted weapons as one anatomical subtree.
    const arms = mech.children.filter((child) => child.userData.motion_joint);
    expect(arms).toHaveLength(2);
    expect(
      arms
        .find((child) => child.userData.motion_role === "arm-r")
        ?.getObjectByName("mesh:tdf.mech.weapon-arm.autocannon"),
    ).toBeDefined();
    expect(names(mech)).toContain("mesh:tdf.mech.weapon-arm.autocannon");
    expect(names(mech)).toContain("socket_muzzle");
  });

  it("loads the template's model when it carries no loadout, as a squad, a bug or an old save does", async () => {
    const models = new FakeModelLoader();
    const source = new LoadoutUnitModelSource({ models });
    const mech = await source.load(template());
    expect(models.loads).toEqual(["tdf.mech.assembled-a"]);
    expect(mech.name).toBe("tdf.mech.assembled-a");
  });

  it("takes an assembler of the caller's choosing", async () => {
    const models = new FakeModelLoader();
    const assembler = new MechAssembler({ models });
    const source = new LoadoutUnitModelSource({ models, assembler });
    await source.load(template(STARTER_LOADOUT));
    expect(models.loads.length).toBe(6);
  });

  it("draws two loadouts as two different mechs", async () => {
    const models = new FakeModelLoader();
    const source = new LoadoutUnitModelSource({ models });
    const a = await source.load(template(STARTER_LOADOUT));
    const b = await source.load(
      template({
        ...STARTER_LOADOUT,
        chassisId: "chassis-atlas",
        legsId: "legs-jumper",
        armWeaponId: "arm-weapon-railgun",
      }),
    );
    expect(names(a)).not.toEqual(names(b));
    expect(names(b)).toContain("mesh:tdf.mech.legs.jumper");
    expect(names(b)).toContain("mesh:tdf.mech.weapon-arm.railgun");
  });
});

describe("flattenModel", () => {
  it("keeps every leaf's world transform while putting it beside the others", () => {
    const root = new Group();
    const legs = new Group();
    legs.name = "legs";
    const socket = new Group();
    socket.name = "socket_chassis";
    socket.position.set(0, 2, 0);
    const torso = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial(),
    );
    torso.name = "torso";
    torso.position.set(0.5, 0, 0);
    socket.add(torso);
    legs.add(socket);
    root.add(legs);
    const foot = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    foot.name = "foot_l";
    legs.add(foot);

    const flat = flattenModel(root);

    expect(flat.children.map((c) => c.name).sort()).toEqual([
      "foot_l",
      "torso",
    ]);
    flat.updateWorldMatrix(true, true);
    const torsoWorld = flat
      .getObjectByName("torso")!
      .getWorldPosition(new Vector3());
    // The socket's offset is baked into the part it carried.
    expect(torsoWorld.x).toBeCloseTo(0.5);
    expect(torsoWorld.y).toBeCloseTo(2);
    expect(flat.getObjectByName("torso")!.parent).toBe(flat);
  });
});
