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
});
