import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Box3 } from "three";
import { describe, expect, it } from "vitest";
import type { ResinSurfaceAppearance } from "./map-model-resolver";
import { fitResinSurface, resinSurfaceKey } from "./resin-surface-model";

describe("fitted resin surfaces", () => {
  it("follows a raised support without mutating either borrowed prototype", () => {
    const material = new MeshStandardMaterial();
    const skin = new Group();
    const geometry = new BoxGeometry(0.9, 0.1, 0.9);
    geometry.translate(0, 0.05, 0);
    skin.add(new Mesh(geometry, material));
    const support = new Group();
    const slab = new BoxGeometry(1, 1, 1);
    slab.translate(0, 0.5, 0);
    support.add(new Mesh(slab, material));
    const appearance: ResinSurfaceAppearance = {
      support: {
        modelId: "building.stairs",
        level: 0,
        position: { x: 0, y: 0, z: 0 },
        turns: 0,
        tile: { x: 0, y: 0, z: 0 },
        scaleZ: 0.5,
      },
      turns: 0,
      size: 1,
      thickness: 1,
    };
    const before = Array.from(geometry.getAttribute("position").array);
    const fitted = fitResinSurface(skin, support, appearance);
    const box = new Box3().setFromObject(fitted);
    expect(box.min.y).toBeCloseTo(1);
    expect(box.max.y).toBeCloseTo(1.1);
    expect(box.max.z - box.min.z).toBeCloseTo(0.45);
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(before);
    expect(support.parent).toBeNull();
    expect((fitted.children[0] as Mesh).material).toBe(material);
    const elsewhere = {
      ...appearance,
      support: {
        ...appearance.support,
        position: { x: 20, y: 8, z: 31 },
        tile: { x: 20, y: 8, z: 31 },
      },
    };
    expect(resinSurfaceKey(elsewhere)).toBe(resinSurfaceKey(appearance));
    expect(resinSurfaceKey({ ...appearance, thickness: 0.2 })).not.toBe(
      resinSurfaceKey(appearance),
    );
  });
  it("keeps a world-aligned strand in place when its support is rotated", () => {
    const material = new MeshStandardMaterial();
    const geometry = new BoxGeometry(0.08, 0.04, 0.6);
    geometry.translate(0.28, 0.02, 0);
    const skin = new Group();
    skin.add(new Mesh(geometry, material));
    const support = new Group();
    const slab = new BoxGeometry(1, 0.2, 1);
    slab.translate(0, 0.1, 0);
    support.add(new Mesh(slab, material));
    const fitted = fitResinSurface(skin, support, {
      support: {
        modelId: "building.stairs",
        turns: 1,
        level: 0,
        position: { x: 0.5, y: 0, z: 0.5 },
        tile: { x: 0, y: 0, z: 0 },
      },
      turns: 0,
      size: 1,
      thickness: 1,
      conform: true,
      pattern: { x: 0, z: 0, turns: 0, neighbours: 255, growth: 1 },
    });
    const bounds = new Box3().setFromObject(fitted);
    expect(bounds.min.x).toBeCloseTo(0.24);
    expect(bounds.max.x).toBeCloseTo(0.32);
    expect(bounds.min.z).toBeCloseTo(-0.3);
    expect(bounds.max.z).toBeCloseTo(0.3);
    expect(bounds.min.y).toBeCloseTo(0.2);
  });
});
