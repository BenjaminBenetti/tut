import {
  DataTexture,
  LinearFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { hashSeed } from "../../core/service/seed-hash";

// ===========================================
// Constants
// ===========================================

/** Texture size; the scene stretches it over the viewport behind the map. */
export const SPACE_BACKDROP_WIDTH = 1024;
export const SPACE_BACKDROP_HEIGHT = 512;

/** Space at the top of the view, a shade under `ui-bg`. */
const SPACE_TOP = 0x05070b;

/** Space at the limb: `ui-bg`, the clear colour every other map shows. */
const SPACE_LOW = 0x0b0d12;

/** Earth's night side, a blue-black a shade over `ui-bg`. */
const EARTH_BODY = 0x0e1420;

/** The graticule over Earth: `ui-line`, as the strategic map draws it. */
const GRATICULE = 0x2e3646;

/** The limb and its atmosphere: `ui-info`, the strategic map's coastlines. */
const LIMB = 0x7fd1ff;

/** Earth's radius, in texture widths: only a shallow arc of it shows. */
const EARTH_RADIUS = 1.8;

/** Where the limb crests, as a share of the height from the bottom. */
const LIMB_CREST = 0.24;

/** Where the limb crests, as a share of the width from the left. */
const LIMB_CENTRE = 0.62;

/** Pixels over which the atmosphere fades out into space. */
const GLOW_PIXELS = 18;

/** Pixels between graticule circles on Earth's face. */
const GRATICULE_SPACING = 22;

/** Stars scattered over the sky; none is drawn over Earth. */
const STARS = 520;

/** The seed every backdrop draws its stars from, so every map shares one sky. */
const STAR_SEED = "spore-platform-sky";

// ===========================================
// Backdrop
// ===========================================

/**
 * The sky behind a map fought in orbit (#1179): black space scattered
 * with stars, and the curve of Earth's night side rising across the
 * bottom of the view, its limb lit by a thin band of atmosphere in the
 * strategic map's `ui-info` blue and its face ruled by the same
 * graticule, so the planet reads as the one the campaign is fought over.
 *
 * ```
 *    ·    ·        ·     ·   ·        stars (fixed seed)
 *       ·     ·  ·     ·        ·
 *   ·      ▁▁▂▂▃▃▃▃▃▃▃▃▂▂▁▁      ·    the limb, glowing
 *     ▁▂▃▀  ( ( ( ( ( ( )  ▀▃▂▁       Earth's face, graticule rings
 * ```
 *
 * A `DataTexture` like the blast ring, so it needs no DOM and a headless
 * test can inspect its pixels; row 0 is the bottom of the view. The
 * scene draws it as its background, one full-screen quad per frame.
 *
 * @returns A texture the caller owns and must dispose.
 */
export function createSpaceBackdrop(): DataTexture {
  const pixels = spaceBackdropPixels();
  const texture = new DataTexture(
    pixels,
    SPACE_BACKDROP_WIDTH,
    SPACE_BACKDROP_HEIGHT,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.name = "space-backdrop";
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The backdrop's RGBA bytes, row 0 at the bottom: the same every call.
 *
 * @returns `SPACE_BACKDROP_WIDTH × SPACE_BACKDROP_HEIGHT × 4` bytes.
 */
export function spaceBackdropPixels(): Uint8Array {
  const width = SPACE_BACKDROP_WIDTH;
  const height = SPACE_BACKDROP_HEIGHT;
  const pixels = new Uint8Array(width * height * 4);
  const radius = EARTH_RADIUS * width;
  const cx = LIMB_CENTRE * width;
  const cy = LIMB_CREST * height - radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const above = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - radius;
      const colour =
        above < 0
          ? earthFace(-above)
          : glow(mix(SPACE_LOW, SPACE_TOP, y / height), above);
      write(pixels, (y * width + x) * 4, colour);
    }
  }
  scatterStars(pixels, cx, cy, radius);
  return pixels;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Earth's face `depth` pixels in from the limb: the night side, ruled
 * with faint graticule circles and brightening into the limb's line.
 */
function earthFace(depth: number): number {
  const ring = depth % GRATICULE_SPACING;
  const ruled = ring < 1 ? mix(EARTH_BODY, GRATICULE, 0.6) : EARTH_BODY;
  const edge = Math.max(0, 1 - depth / 3);
  return mix(ruled, LIMB, edge * 0.85);
}

/** Space `above` pixels over the limb, lit by the atmosphere near it. */
function glow(space: number, above: number): number {
  const lit = Math.max(0, 1 - above / GLOW_PIXELS);
  return mix(space, LIMB, lit * lit * 0.55);
}

/** Stars from a fixed seed, one or two pixels each, never over Earth. */
function scatterStars(
  pixels: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
): void {
  const rng = new Mulberry32Rng(hashSeed(STAR_SEED));
  const width = SPACE_BACKDROP_WIDTH;
  for (let n = 0; n < STARS; n++) {
    const x = rng.nextInt(0, width - 2);
    const y = rng.nextInt(0, SPACE_BACKDROP_HEIGHT - 2);
    const brightness = 0.25 + rng.next() * 0.75;
    const size = brightness > 0.9 ? 2 : 1;
    if (Math.hypot(x - cx, y - cy) < radius + GLOW_PIXELS) continue;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const i = ((y + dy) * width + x + dx) * 4;
        const star = mix(read(pixels, i), 0xe8eef8, brightness);
        write(pixels, i, star);
      }
    }
  }
}

/** Linear blend of two 0xRRGGBB colours by `t` in [0, 1]. */
function mix(a: number, b: number, t: number): number {
  const channel = (shift: number): number => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t) << shift;
  };
  return channel(16) | channel(8) | channel(0);
}

/** Writes an opaque 0xRRGGBB colour at byte offset `i`. */
function write(pixels: Uint8Array, i: number, colour: number): void {
  pixels[i] = (colour >> 16) & 0xff;
  pixels[i + 1] = (colour >> 8) & 0xff;
  pixels[i + 2] = colour & 0xff;
  pixels[i + 3] = 0xff;
}

/** Reads the 0xRRGGBB colour at byte offset `i`. */
function read(pixels: Uint8Array, i: number): number {
  return (
    ((pixels[i] ?? 0) << 16) |
    ((pixels[i + 1] ?? 0) << 8) |
    (pixels[i + 2] ?? 0)
  );
}
