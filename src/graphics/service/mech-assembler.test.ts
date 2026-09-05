import { Group, Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetId } from "../../content/data/model-ids";
import type { MechAssembly } from "../data/part-model-table";
import type { AssetLogger } from "../model/asset-logger";
import type { ModelLoader } from "../model/model-loader";
import { MECH_ROOT_NAME, MechAssembler } from "./mech-assembler";

// ===========================================
// Fixtures
// ===========================================

/** Sockets each stand-in part carries, mirroring the real GLBs (§6). */
const SOCKETS: Readonly<Record<string, readonly string[]>> = {
  "tdf.mech.legs-a": ["socket_chassis"],
  "tdf.mech.chassis-a": ["socket_arm_l", "socket_arm_r", "socket_back"],
  "tdf.mech.arm-l-a": ["socket_weapon"],
  "tdf.mech.arm-r-a": ["socket_weapon"],
  "tdf.mech.weapon-arm.autocannon": ["socket_muzzle"],
  "tdf.mech.weapon-back.missile-pod": ["socket_muzzle"],
};

/** A full mech, matching the `tdf.mech.assembled-a` reference. */
const FULL: MechAssembly = {
  legs: "tdf.mech.legs-a",
  chassis: "tdf.mech.chassis-a",
  armLeft: "tdf.mech.arm-l-a",
  armRight: "tdf.mech.arm-r-a",
  armWeapon: "tdf.mech.weapon-arm.autocannon",
  backWeapon: "tdf.mech.weapon-back.missile-pod",
};

/** Loads a named group per id, carrying that model's socket empties. */
class FakeModelLoader implements ModelLoader {
  readonly loads: ModelAssetId[] = [];
  /** Ids whose stand-in is built with no sockets at all. */
  socketless = new Set<string>();

  load(id: ModelAssetId): Promise<Object3D> {
    this.loads.push(id);
    const group = new Group();
    group.name = id;
    if (!this.socketless.has(id)) {
      for (const socket of SOCKETS[id] ?? []) {
        const empty = new Object3D();
        empty.name = socket;
        group.add(empty);
      }
    }
    return Promise.resolve(group);
  }

  preload(): Promise<void> {
    return Promise.resolve();
  }
}

/** Collects warnings so a test can assert what was reported. */
class RecordingLogger implements AssetLogger {
  readonly warnings: string[] = [];
  warn(message: string): void {
    this.warnings.push(message);
  }
}

/** The chain of node names from `root` down to the named descendant. */
const pathTo = (root: Object3D, name: string): string[] => {
  const found = root.getObjectByName(name);
  const path: string[] = [];
  for (let node = found?.parent; node; node = node.parent) {
    path.unshift(node.name);
  }
  return path;
};

// ===========================================
// Tests
// ===========================================

describe("MechAssembler", () => {
  it("hangs every part on the socket the style guide gives it", async () => {
    const models = new FakeModelLoader();
    const root = await new MechAssembler({ models }).assemble(FULL);

    expect(root.name).toBe(MECH_ROOT_NAME);
    expect(pathTo(root, "tdf.mech.legs-a")).toEqual([MECH_ROOT_NAME]);
    // legs ─ socket_chassis ─► chassis
    expect(pathTo(root, "tdf.mech.chassis-a")).toEqual([
      MECH_ROOT_NAME,
      "tdf.mech.legs-a",
      "socket_chassis",
    ]);
    // chassis ─ socket_arm_l / socket_arm_r ─► arms
    expect(pathTo(root, "tdf.mech.arm-l-a").at(-1)).toBe("socket_arm_l");
    expect(pathTo(root, "tdf.mech.arm-r-a").at(-1)).toBe("socket_arm_r");
    expect(pathTo(root, "tdf.mech.weapon-back.missile-pod").at(-1)).toBe(
      "socket_back",
    );
  });

  it("puts the arm weapon on the right arm, not on the chassis", async () => {
    const models = new FakeModelLoader();
    const root = await new MechAssembler({ models }).assemble(FULL);
    expect(pathTo(root, "tdf.mech.weapon-arm.autocannon")).toEqual([
      MECH_ROOT_NAME,
      "tdf.mech.legs-a",
      "socket_chassis",
      "tdf.mech.chassis-a",
      "socket_arm_r",
      "tdf.mech.arm-r-a",
      "socket_weapon",
    ]);
  });

  it("loads each named part exactly once and skips absent slots", async () => {
    const models = new FakeModelLoader();
    await new MechAssembler({ models }).assemble({
      chassis: "tdf.mech.chassis-a",
    });
    expect(models.loads).toEqual(["tdf.mech.chassis-a"]);
  });

  it("keeps drawing the rest when a part is missing", async () => {
    // A draft mid-edit can name a part with no model. The chassis has
    // no legs to stand on, so it becomes the root and its arms still
    // find their sockets -- one absent part costs its own picture only.
    const models = new FakeModelLoader();
    const root = await new MechAssembler({ models }).assemble({
      ...FULL,
      legs: undefined,
    });
    expect(pathTo(root, "tdf.mech.chassis-a")).toEqual([MECH_ROOT_NAME]);
    expect(pathTo(root, "tdf.mech.arm-r-a").at(-1)).toBe("socket_arm_r");
  });

  it("warns and falls back to the host origin when a socket is missing", async () => {
    // A re-export that dropped its sockets draws a mech with its arms
    // in its chest. That is easy to miss and the warning names the file.
    const models = new FakeModelLoader();
    models.socketless.add("tdf.mech.chassis-a");
    const logger = new RecordingLogger();
    const root = await new MechAssembler({ models, logger }).assemble(FULL);

    expect(pathTo(root, "tdf.mech.arm-l-a").at(-1)).toBe("tdf.mech.chassis-a");
    expect(logger.warnings).toHaveLength(3);
    expect(logger.warnings[0]).toContain("tdf.mech.chassis-a");
    expect(logger.warnings[0]).toContain("socket_arm_l");
  });

  it("returns an empty group for a loadout with no models at all", async () => {
    const root = await new MechAssembler({
      models: new FakeModelLoader(),
    }).assemble({});
    expect(root.children).toHaveLength(0);
  });
});
