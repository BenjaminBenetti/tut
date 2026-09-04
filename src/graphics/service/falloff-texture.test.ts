import { describe, expect, it } from "vitest";

import { createFalloffTexture } from "./falloff-texture";

/**
 * The texel's opacity level at `(x, y)` in a 64-wide RGBA buffer. three
 * reads an `alphaMap` from the green channel, so that is the one that
 * has to carry the falloff.
 */
function levelAt(data: Uint8Array, x: number, y: number): number {
  return data[(y * 64 + x) * 4 + 1] ?? -1;
}

describe("createFalloffTexture", () => {
  it("is opaque at the centre and transparent at the edge", () => {
    const texture = createFalloffTexture();
    const data = texture.image.data as Uint8Array;

    expect(levelAt(data, 32, 32)).toBeGreaterThan(0xf0);
    expect(levelAt(data, 0, 32)).toBe(0);
    expect(levelAt(data, 63, 32)).toBe(0);
    expect(levelAt(data, 32, 0)).toBe(0);
    expect(levelAt(data, 0, 0)).toBe(0);
    texture.dispose();
  });

  it("falls off monotonically outward, so the wash has no visible ring", () => {
    const texture = createFalloffTexture();
    const data = texture.image.data as Uint8Array;

    let previous = levelAt(data, 32, 32);
    for (let x = 33; x < 64; x++) {
      const alpha = levelAt(data, x, 32);
      expect(alpha).toBeLessThanOrEqual(previous);
      previous = alpha;
    }
    expect(previous).toBe(0);
    texture.dispose();
  });

  it("stays fully opaque in the alpha channel, which three ignores here", () => {
    const texture = createFalloffTexture();
    const data = texture.image.data as Uint8Array;

    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(0xff);
    }
    texture.dispose();
  });

  it("is neutral grey, so the material's colour decides the tint", () => {
    const texture = createFalloffTexture();
    const data = texture.image.data as Uint8Array;
    const centre = (32 * 64 + 32) * 4;

    expect(data[centre]).toBe(data[centre + 1]);
    expect(data[centre + 1]).toBe(data[centre + 2]);
    expect(data[centre + 1]).toBeGreaterThan(0xf0);
  });
});
