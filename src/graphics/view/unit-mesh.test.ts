import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { LEVEL_HEIGHT, SLAB_HEIGHT } from "../data/mapgen-preview-palette";
import { FACING_YAW, UnitMesh } from "./unit-mesh";

/** A stand-in model: one box mesh, pivot at base centre. */
function model(): Group {
  const group = new Group();
  const box = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  box.position.y = 0.5;
  group.add(box);
  return group;
}

describe("UnitMesh", () => {
  it("names its group, hides both rings and exposes the model's meshes as pick targets", () => {
    const mesh = new UnitMesh("unit-1", model());
    expect(mesh.object.name).toBe("unit:unit-1");
    expect(mesh.pickTargets()).toHaveLength(1);
    const rings = mesh.object.children.filter((c) => c.name.endsWith("-ring"));
    expect(rings.map((r) => r.visible)).toEqual([false, false]);
  });

  it("poses at the tile's top centre and turns to its facing", () => {
    const mesh = new UnitMesh("unit-1", model());
    mesh.setPose({ x: 3, y: 1, z: 5 }, "e");
    expect(mesh.worldPosition()).toEqual({
      x: 3.5,
      y: LEVEL_HEIGHT + SLAB_HEIGHT,
      z: 5.5,
    });
    expect(mesh.object.rotation.y).toBe(FACING_YAW.e);
    expect(FACING_YAW.n).toBe(0);
    expect(FACING_YAW.s).toBeCloseTo(Math.PI);
    expect(FACING_YAW.w).toBeCloseTo(-FACING_YAW.e);
  });

  it("shows the hover and selection rings independently", () => {
    const mesh = new UnitMesh("unit-1", model());
    const ring = (name: string) => mesh.object.getObjectByName(name);
    mesh.setHighlight({ hovered: true, selected: false });
    expect(ring("hover-ring")?.visible).toBe(true);
    expect(ring("selection-ring")?.visible).toBe(false);
    mesh.setHighlight({ hovered: false, selected: true });
    expect(ring("hover-ring")?.visible).toBe(false);
    expect(ring("selection-ring")?.visible).toBe(true);
  });

  it("dispose detaches the group", () => {
    const parent = new Group();
    const mesh = new UnitMesh("unit-1", model());
    parent.add(mesh.object);
    mesh.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
