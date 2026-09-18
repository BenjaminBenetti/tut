import { describe, expect, it, vi } from "vitest";
import { MeshStandardMaterial, Texture } from "three";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import {
  infestationContactField,
  InfestationGroundMaterials,
} from "./infestation-ground-materials";

/** A resin patch beside exposed grass, with another storey above the grass. */
function fixture() {
  return new FixtureMapBuilder(3, 3, 3)
    .fillGround(0, "grass")
    .tile({ x: 1, y: 0, z: 1 }, "infested")
    .tile({ x: 0, y: 2, z: 0 }, "roof")
    .build();
}

describe("continuous colony ground materials", () => {
  it("keeps the contact field on the lowest surface instead of overwriting it with roofs", () => {
    const map = fixture();
    const field = infestationContactField(map);
    expect(field[4 * 4]).toBe(255);
    expect(field[0]).toBe(0);
    expect([...field.slice(1, 4)]).toEqual([
      ...field.slice(4 * 4 + 1, 4 * 4 + 4),
    ]);
  });

  it("shares world-projected PBR materials while preserving authored relief and borrowed textures", async () => {
    const textures = [new Texture(), new Texture(), new Texture()];
    const dispose = textures.map((texture) => vi.spyOn(texture, "dispose"));
    let next = 0;
    const materials = new InfestationGroundMaterials(fixture());
    await materials.prepare({
      loadTexture: () => Promise.resolve(textures[next++]),
    });
    const slab = new MeshStandardMaterial({ name: "bug-chitin-dark" });
    const relief = new MeshStandardMaterial({ name: "bug-chitin-tan" });
    const actual = materials.material(slab) as MeshStandardMaterial;
    expect(materials.material(slab)).toBe(actual);
    expect(materials.material(relief)).toBe(relief);
    expect(actual.map).not.toBe(textures[0]);
    expect(actual.map!.source).toBe(textures[0]!.source);
    expect(actual.normalMap).toBeDefined();
    expect(actual.roughnessMap).toBeDefined();
    expect(slab.map).toBeNull();
    materials.dispose();
    expect(dispose.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});
