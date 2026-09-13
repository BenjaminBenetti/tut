import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";

// ===========================================
// Constants
// ===========================================

/** Side of the generated texture; a soft ring needs no more. */
const SIZE = 128;

/** Radius of the ring's brightest line, in UV units from the centre. */
const RING_RADIUS = 0.4;

/** Half the ring's width, in UV units: the band fades to nothing this far either side of the line. */
const RING_HALF_WIDTH = 0.08;

// ===========================================
// Ring
// ===========================================

/**
 * A greyscale annulus, brightest along one circle and fading smoothly
 * to black on both sides, for the shockwave of an explosion (#1130):
 * drawn additively and scaled up over a few frames it reads as the
 * pressure wave leaving the impact.
 *
 * ```
 *   level   1 ┤        ▄▀▀▄
 *             │       ▄    ▄
 *           0 ┼──────▀──────▀────▶ distance from centre
 *             0    0.32 0.4 0.48
 * ```
 *
 * Built as a `DataTexture` like the falloff wash, so it needs no DOM
 * and a headless test can inspect the pixels (architecture §2). Black
 * outside the band rather than transparent: an additive sprite adds
 * nothing where it is black, and the sprite's own opacity does the
 * fading.
 *
 * @returns A texture the caller owns and must dispose.
 */
export function createBlastRingTexture(): DataTexture {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE - 0.5;
      const v = (y + 0.5) / SIZE - 0.5;
      const distance = Math.sqrt(u * u + v * v);
      const index = (y * SIZE + x) * 4;
      const level = Math.round(0xff * ringLevel(distance));
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
  texture.name = "blast-ring";
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Brightness of the ring at `distance` from the centre: one on the
 * line, easing to zero `RING_HALF_WIDTH` either side of it.
 *
 * @param distance - Distance from the centre in UV units.
 * @returns The level in `[0, 1]`.
 */
function ringLevel(distance: number): number {
  const off = Math.abs(distance - RING_RADIUS) / RING_HALF_WIDTH;
  const clamped = Math.min(1, Math.max(0, off));
  const eased = 1 - clamped;
  return eased * eased * (3 - 2 * eased);
}
