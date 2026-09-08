import { describe, expect, it } from "vitest";
import { NATURAL_MATERIAL_TRANSITION } from "../data/natural-material-transition";
import { naturalMaterialWeights } from "./natural-material-weights";

/** Four columns of snow beside four of rock, with no other palette entries. */
function snowAndRock(): Uint8Array {
  const field = new Uint8Array(8 * 8 * 4);
  for (let z = 0; z < 8; z++)
    for (let x = 0; x < 8; x++) field[(z * 8 + x) * 4] = x < 4 ? 4 : 5;
  return field;
}

describe("baked natural material weights", () => {
  it("has repeatable irregular contacts while preserving distinct interiors and the source", () => {
    const field = snowAndRock(),
      before = field.slice();
    const pixels = naturalMaterialWeights(field, 8, 8, "contact");
    expect(naturalMaterialWeights(field, 8, 8, "contact")).toEqual(pixels);
    expect(field).toEqual(before);
    const resolution = NATURAL_MATERIAL_TRANSITION.samplesPerTile;
    const width = 8 * resolution;
    const contacts = new Set<number>();
    let mixed = 0;
    for (let z = resolution; z < width - resolution; z++) {
      let contact = 0;
      for (let x = 0; x < width; x++) {
        const offset = (z * width + x) * 4;
        expect(
          pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!,
        ).toBe(0);
        const snow = pixels[offset + 3]!;
        if (x < 2 * resolution) expect(snow).toBe(255);
        if (x >= 6 * resolution) expect(snow).toBe(0);
        if (snow >= 128) contact = x;
        if (snow > 0 && snow < 255) mixed++;
      }
      contacts.add(contact);
    }
    expect(contacts.size).toBeGreaterThan(4);
    expect(mixed).toBeGreaterThan(width);
    expect(naturalMaterialWeights(field, 8, 8, "different")).not.toEqual(
      pixels,
    );
  });

  it("does not manufacture rock at a junction of three other natural materials", () => {
    const field = new Uint8Array(4 * 4 * 4);
    for (let z = 0; z < 4; z++)
      for (let x = 0; x < 4; x++)
        field[(z * 4 + x) * 4] = z < 2 ? 1 : x < 2 ? 2 : 3;
    const pixels = naturalMaterialWeights(field, 4, 4, "coastal-contact");
    for (let offset = 0; offset < pixels.length; offset += 4) {
      expect(pixels[offset]! + pixels[offset + 1]! + pixels[offset + 2]!).toBe(
        255,
      );
      expect(pixels[offset + 3]).toBe(0);
    }
  });
});
