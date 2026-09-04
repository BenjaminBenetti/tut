import type { MeshBasicMaterial } from "three";
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

  it("draws the selection ring in the transparent pass, over what stands in front (#605)", () => {
    const mesh = new UnitMesh("unit-1", model());
    const ring = mesh.object.getObjectByName("selection-ring");
    expect(ring).toBeInstanceOf(Mesh);
    const material = (ring as Mesh).material as MeshBasicMaterial;
    // At full opacity three.js would put this in the *opaque* pass,
    // where `depthWrite: false` lets everything drawn afterwards paint
    // over it -- which is why the ring was in the scene graph, visible,
    // and absent from the screen in every build before this.
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    // Units deploy shoulder to shoulder; depth-tested, a squad's ring
    // beside a 2.79 u mech is reduced to a sliver.
    expect(material.depthTest).toBe(false);
    // Above the tile overlays, which occupy render orders 1 through 4.
    expect((ring as Mesh).renderOrder).toBeGreaterThan(4);
  });

  it("keeps the hover ring depth-tested, so it cannot reveal what vision hides (#605)", () => {
    const mesh = new UnitMesh("unit-1", model());
    const ring = mesh.object.getObjectByName("hover-ring") as Mesh;
    const material = ring.material as MeshBasicMaterial;
    // Hover lands on enemies too, so a ring drawn through a wall would
    // give away a bug that vision is hiding (ADR 0006). Only selection,
    // which is always the player's own unit, may draw through.
    expect(material.depthTest).toBe(true);
  });

  it("dispose detaches the group", () => {
    const parent = new Group();
    const mesh = new UnitMesh("unit-1", model());
    parent.add(mesh.object);
    mesh.dispose();
    expect(parent.children).toHaveLength(0);
  });
});
