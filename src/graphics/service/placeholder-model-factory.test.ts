import type { BoxGeometry, Mesh, Object3D } from "three";
import { describe, expect, it } from "vitest";

import type { ModelAssetEntry } from "../model/asset-manifest";
import {
  PLACEHOLDER_MIN_SIZE,
  PlaceholderModelFactory,
} from "./placeholder-model-factory";

const mech: ModelAssetEntry = {
  category: "units",
  path: "units/mech.glb",
  footprint: { w: 1, d: 1 },
  height: 2.6,
  sockets: ["socket_arm_l", "socket_arm_r", "socket_back", "socket_legs"],
  quality: "placeholder",
};

/** Finds the box mesh inside a placeholder. */
function boxOf(root: Object3D): Mesh {
  const mesh = root.getObjectByName("placeholder-box") as Mesh | undefined;
  if (mesh === undefined) {
    throw new Error("Placeholder has no box");
  }
  return mesh;
}

describe("PlaceholderModelFactory", () => {
  const factory = new PlaceholderModelFactory();

  it("builds a box of the entry's footprint and height standing on y = 0", () => {
    const root = factory.create("tdf.mech.chassis-a", mech);
    const box = boxOf(root);
    const { width, height, depth } = (box.geometry as BoxGeometry).parameters;
    expect([width, height, depth]).toEqual([1, 2.6, 1]);
    expect(box.position.y - height / 2).toBeCloseTo(0);
    expect(root.name).toBe("placeholder:tdf.mech.chassis-a");
  });

  it("clamps zero dimensions to the minimum size so sub-parts stay visible", () => {
    const flat: ModelAssetEntry = {
      ...mech,
      footprint: { w: 0, d: 0 },
      height: 0,
    };
    const { width, height, depth } = (
      boxOf(factory.create("tdf.mech.arm-l-a", flat)).geometry as BoxGeometry
    ).parameters;
    expect([width, height, depth]).toEqual([
      PLACEHOLDER_MIN_SIZE,
      PLACEHOLDER_MIN_SIZE,
      PLACEHOLDER_MIN_SIZE,
    ]);
  });

  it("adds one empty node per socket, placed on the box", () => {
    const root = factory.create("tdf.mech.chassis-a", mech);
    const names = root.children.map((child) => child.name);
    for (const socket of mech.sockets) {
      expect(names).toContain(socket);
    }
    const left = root.getObjectByName("socket_arm_l");
    const right = root.getObjectByName("socket_arm_r");
    const legs = root.getObjectByName("socket_legs");
    expect(left?.position.x).toBeCloseTo(0.5);
    expect(right?.position.x).toBeCloseTo(-0.5);
    expect(left?.position.y).toBeCloseTo(2.6 * 0.75);
    expect(legs?.position.toArray()).toEqual([0, 0, 0]);
  });

  it("keeps duplicate socket names and puts unknown sockets on top", () => {
    const odd: ModelAssetEntry = {
      ...mech,
      sockets: ["socket_weapon", "socket_weapon", "socket_antenna"],
    };
    const root = factory.create("tdf.mech.assembled-a", odd);
    const weapons = root.children.filter(
      (child) => child.name === "socket_weapon",
    );
    expect(weapons).toHaveLength(2);
    expect(root.getObjectByName("socket_antenna")?.position.y).toBeCloseTo(2.6);
  });

  it("colours the box by category with a palette-named material", () => {
    const bug: ModelAssetEntry = { ...mech, category: "bugs", sockets: [] };
    const material = boxOf(factory.create("bug.brute", bug)).material as {
      name: string;
    };
    expect(material.name).toBe("bug-chitin-mid");
    const unit = boxOf(factory.create("tdf.mech.chassis-a", mech)).material as {
      name: string;
    };
    expect(unit.name).toBe("tdf-grey-mid");
  });

  it("shares nothing between calls", () => {
    const a = factory.create("tdf.mech.chassis-a", mech);
    const b = factory.create("tdf.mech.chassis-a", mech);
    expect(a).not.toBe(b);
    expect(boxOf(a).geometry).not.toBe(boxOf(b).geometry);
  });
});
