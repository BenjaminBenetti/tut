import { describe, expect, it } from "vitest";

import {
  createSpaceBackdrop,
  SPACE_BACKDROP_HEIGHT,
  SPACE_BACKDROP_WIDTH,
  spaceBackdropPixels,
} from "./space-backdrop";

// ===========================================
// Helpers
// ===========================================

const pixels = spaceBackdropPixels();

/** The [r, g, b, a] bytes at a pixel, row 0 at the bottom. */
function at(x: number, y: number): number[] {
  const i = (y * SPACE_BACKDROP_WIDTH + x) * 4;
  return [...pixels.subarray(i, i + 4)];
}

/** True when every colour channel is at most `limit`. */
function darkerThan(rgba: readonly number[], limit: number): boolean {
  return rgba.slice(0, 3).every((channel) => channel <= limit);
}

// ===========================================
// Tests
// ===========================================

describe("space backdrop (#1179)", () => {
  it("draws the same opaque sky every time", () => {
    expect(spaceBackdropPixels()).toEqual(pixels);
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0xff) throw new Error(`transparent byte ${String(i)}`);
    }
  });

  it("is dark space scattered with stars at the top", () => {
    let dark = 0;
    let stars = 0;
    const from = Math.floor(SPACE_BACKDROP_HEIGHT / 2);
    for (let y = from; y < SPACE_BACKDROP_HEIGHT; y++) {
      for (let x = 0; x < SPACE_BACKDROP_WIDTH; x++) {
        const rgba = at(x, y);
        if (darkerThan(rgba, 0x10)) dark++;
        if (!darkerThan(rgba, 0x80)) stars++;
      }
    }
    const total = from * SPACE_BACKDROP_WIDTH;
    expect(dark / total).toBeGreaterThan(0.99);
    expect(stars).toBeGreaterThan(100);
  });

  it("curves Earth's dark face across the bottom, its limb lit blue", () => {
    const x = Math.round(0.62 * SPACE_BACKDROP_WIDTH);
    // The face under the limb: blue-black, a shade over the sky.
    const face = at(x, 4);
    expect(darkerThan(face, 0x40)).toBe(true);
    expect(face[2]).toBeGreaterThan(face[0]!);
    // Up the column, the limb: the brightest pixel is the atmosphere's
    // blue, at the crest.
    let brightest = 0;
    let crest = -1;
    for (let y = 0; y < SPACE_BACKDROP_HEIGHT / 2; y++) {
      const blue = at(x, y)[2]!;
      if (blue > brightest) {
        brightest = blue;
        crest = y;
      }
    }
    expect(brightest).toBeGreaterThan(0xb0);
    const limb = at(x, crest);
    expect(limb[2]).toBeGreaterThan(limb[1]!);
    expect(limb[1]).toBeGreaterThan(limb[0]!);
    expect(crest).toBeGreaterThan(0.2 * SPACE_BACKDROP_HEIGHT);
    expect(crest).toBeLessThan(0.28 * SPACE_BACKDROP_HEIGHT);
    // At the sides the limb has fallen away below the crest's height.
    expect(darkerThan(at(0, crest), 0x20)).toBe(true);
  });

  it("scatters no star over Earth", () => {
    // Walking up each column from the bottom, the first pixel far bluer
    // than it is red is the limb (a star is white, so it is not); below
    // it is Earth, where no star's white may show.
    let limbs = 0;
    let buried = 0;
    for (let x = 0; x < SPACE_BACKDROP_WIDTH; x++) {
      let y = 0;
      for (; y < SPACE_BACKDROP_HEIGHT; y++) {
        const [red, , blue] = at(x, y) as [number, number, number];
        if (blue - red > 0x40) break;
        if (red > 0x80) buried++;
      }
      if (y < SPACE_BACKDROP_HEIGHT / 2) limbs++;
    }
    expect(limbs).toBe(SPACE_BACKDROP_WIDTH);
    expect(buried).toBe(0);
  });

  it("wraps the pixels in a named sRGB texture", () => {
    const texture = createSpaceBackdrop();
    expect(texture.name).toBe("space-backdrop");
    expect(texture.image.width).toBe(SPACE_BACKDROP_WIDTH);
    expect(texture.image.height).toBe(SPACE_BACKDROP_HEIGHT);
    expect(texture.colorSpace).toBe("srgb");
    texture.dispose();
  });
});
