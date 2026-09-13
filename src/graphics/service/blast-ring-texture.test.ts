import { describe, expect, it } from "vitest";

import { createBlastRingTexture } from "./blast-ring-texture";

/** The texel's grey level at `(x, y)` in the 128-wide RGBA buffer. */
function levelAt(data: Uint8Array, x: number, y: number): number {
  return data[(y * 128 + x) * 4 + 1] ?? -1;
}

describe("createBlastRingTexture", () => {
  it("is black at the centre and the corners, and bright on the ring", () => {
    const texture = createBlastRingTexture();
    const data = texture.image.data as Uint8Array;

    expect(levelAt(data, 64, 64)).toBe(0);
    expect(levelAt(data, 0, 0)).toBe(0);
    expect(levelAt(data, 127, 64)).toBe(0);
    // The ring's line sits 0.4 of the width from the centre: 51 texels.
    expect(levelAt(data, 64 + 51, 64)).toBeGreaterThan(0xf0);
    expect(levelAt(data, 64, 64 - 51)).toBeGreaterThan(0xf0);
    texture.dispose();
  });

  it("fades on both sides of the line, so the wave has no hard edge", () => {
    const texture = createBlastRingTexture();
    const data = texture.image.data as Uint8Array;

    // Rising toward the line from inside, falling away from it outside.
    let previous = levelAt(data, 64 + 40, 64);
    for (let x = 64 + 41; x <= 64 + 51; x++) {
      const level = levelAt(data, x, 64);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
    for (let x = 64 + 52; x < 128; x++) {
      const level = levelAt(data, x, 64);
      expect(level).toBeLessThanOrEqual(previous);
      previous = level;
    }
    expect(previous).toBe(0);
    texture.dispose();
  });

  it("is neutral grey and fully opaque, so colour and opacity come from the material", () => {
    const texture = createBlastRingTexture();
    const data = texture.image.data as Uint8Array;
    const onRing = (64 * 128 + 64 + 51) * 4;

    expect(data[onRing]).toBe(data[onRing + 1]);
    expect(data[onRing + 1]).toBe(data[onRing + 2]);
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(0xff);
    }
    texture.dispose();
  });
});
