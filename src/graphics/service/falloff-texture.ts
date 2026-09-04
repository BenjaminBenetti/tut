import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";

// ===========================================
// Constants
// ===========================================

/** Side of the generated texture; small because it is pure gradient. */
const SIZE = 64;

/** Radius, in UV units from the centre, where the falloff reaches zero. */
const EDGE = 0.5;

// ===========================================
// Falloff
// ===========================================

/**
 * A greyscale texture that falls smoothly from white at the centre to
 * black at the edge, for use as an `alphaMap` on washes that must not
 * read as rectangles.
 *
 * ```
 *   level   1 ┤■■■■■■▄▄▄
 *             │        ▀▀▄▄
 *           0 ┼────────────▀▀──▶ distance from centre
 *             0          EDGE
 * ```
 *
 * Built as a `DataTexture` rather than a canvas so it needs no DOM and
 * works the same in a unit test as in the browser (architecture §2).
 * Smoothstep rather than a linear ramp: a linear edge still shows a
 * visible boundary where the gradient stops.
 *
 * @returns A texture the caller owns and must dispose.
 */
export function createFalloffTexture(): DataTexture {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE - 0.5;
      const v = (y + 0.5) / SIZE - 0.5;
      const distance = Math.sqrt(u * u + v * v);
      const index = (y * SIZE + x) * 4;
      // three reads an alphaMap from the **green** channel, not alpha, so
      // the falloff is written as greyscale with the texture left opaque.
      const level = Math.round(0xff * smoothstep(distance / EDGE));
      pixels[index] = level;
      pixels[index + 1] = level;
      pixels[index + 2] = level;
      pixels[index + 3] = 0xff;
    }
  }
  const texture = new DataTexture(
    pixels,
    SIZE,
    SIZE,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = "region-falloff";
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Smooth 1 → 0 falloff over `t` in `[0, 1]`, flat at both ends so
 * neither the centre nor the edge shows a seam.
 *
 * @param t - Distance from the centre as a fraction of the edge radius.
 * @returns The opacity multiplier in `[0, 1]`.
 */
function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  const eased = 1 - clamped;
  return eased * eased * (3 - 2 * eased);
}
