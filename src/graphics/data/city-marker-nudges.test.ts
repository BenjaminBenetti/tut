/// <reference types="node" />
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { EARTH_MAP } from "../../overworld/data/earth-map";
import { cityMarkerLayout } from "../service/overworld-layout";
import { CITY_MARKER_NUDGES } from "./city-marker-nudges";
import { TEXTURE_MANIFEST } from "./texture-manifest";

// ===========================================
// Texture reading
// ===========================================

/** One decoded image: palette-indexed pixels and the palette itself. */
interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly Uint8Array[];
  readonly palette: Buffer;
}

/**
 * Decodes the 8-bit palette PNG the Earth map ships as, far enough to
 * sample one pixel: chunks, inflate, then undo the per-row filters.
 * Deliberately narrow — it throws on anything but the format this asset
 * uses, so a redrawn texture in another format fails loudly here rather
 * than sampling nonsense.
 */
function decodePalettePng(bytes: Buffer): DecodedPng {
  let pos = 8;
  let width = 0;
  let height = 0;
  let palette = Buffer.alloc(0);
  const idat: Buffer[] = [];
  while (pos < bytes.length) {
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString("ascii", pos + 4, pos + 8);
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const depth = data.readUInt8(8);
      const colour = data.readUInt8(9);
      if (depth !== 8 || colour !== 3) {
        throw new Error(
          `Expected an 8-bit palette PNG, got depth ${String(depth)} colour type ${String(colour)}`,
        );
      }
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    }
    pos += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rows: Uint8Array[] = [];
  let previous = new Uint8Array(width);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++] ?? 0;
    const line = new Uint8Array(raw.subarray(offset, offset + width));
    offset += width;
    for (let i = 0; i < width; i++) {
      const a = i > 0 ? (line[i - 1] ?? 0) : 0;
      const b = previous[i] ?? 0;
      const c = i > 0 ? (previous[i - 1] ?? 0) : 0;
      const value = line[i] ?? 0;
      if (filter === 1) line[i] = (value + a) & 0xff;
      else if (filter === 2) line[i] = (value + b) & 0xff;
      else if (filter === 3) line[i] = (value + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pick = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (value + pick) & 0xff;
      }
    }
    rows.push(line);
    previous = line;
  }
  return { width, height, rows, palette };
}

/** The colour at a normalised texture coordinate, as `[r, g, b]`. */
function sample(
  png: DecodedPng,
  u: number,
  v: number,
): [number, number, number] {
  const x = Math.min(png.width - 1, Math.max(0, Math.floor(u * png.width)));
  const y = Math.min(png.height - 1, Math.max(0, Math.floor(v * png.height)));
  const index = png.rows[y]?.[x] ?? 0;
  return [
    png.palette[index * 3] ?? 0,
    png.palette[index * 3 + 1] ?? 0,
    png.palette[index * 3 + 2] ?? 0,
  ];
}

/**
 * Whether a pixel is sea. The map's water is strongly blue-dominant and
 * its land — green, sand, rock, ice — never is, so a channel comparison
 * separates them without a palette lookup table.
 */
function isOcean([r, g, b]: [number, number, number]): boolean {
  return b > r + 25 && b > g + 10;
}

// ===========================================
// Tests
// ===========================================

const png = decodePalettePng(
  readFileSync(`public/${TEXTURE_MANIFEST["overworld.earth-map"].path}`),
);

describe("city markers against the Earth texture", () => {
  it("reads the shipped map at its manifest size", () => {
    expect(png.width).toBe(TEXTURE_MANIFEST["overworld.earth-map"].width);
    expect(png.height).toBe(TEXTURE_MANIFEST["overworld.earth-map"].height);
    // A sanity check on the sampler itself: the mid-Pacific reads as
    // water and the western Sahara as land. Only these two: the drawing
    // is loose enough elsewhere that more would be testing the art.
    expect(isOcean(sample(png, 0.05, 0.5))).toBe(true);
    expect(isOcean(sample(png, 0.528, 0.389))).toBe(false);
  });

  it("puts every city marker on land, not in the sea (#439)", () => {
    const inTheSea: string[] = [];
    for (const city of EARTH_MAP.cities) {
      const layout = cityMarkerLayout(city);
      if (isOcean(sample(png, layout.x, layout.y))) {
        inTheSea.push(city.name);
      }
    }
    expect(inTheSea).toEqual([]);
    expect(EARTH_MAP.cities.length).toBeGreaterThan(30);
  });

  it("nudges only cities the drawing disagrees with, and only slightly", () => {
    for (const city of EARTH_MAP.cities) {
      const nudge = CITY_MARKER_NUDGES[city.id];
      if (nudge === undefined) {
        // Unnudged cities must already sit on land by their true position.
        expect(isOcean(sample(png, city.layout.x, city.layout.y))).toBe(false);
        continue;
      }
      expect(Math.abs(nudge.x)).toBeLessThan(0.02);
      expect(Math.abs(nudge.y)).toBeLessThan(0.04);
    }
    // Every nudge names a city that exists.
    for (const id of Object.keys(CITY_MARKER_NUDGES)) {
      expect(
        EARTH_MAP.cities.some((city) => city.id === id),
        id,
      ).toBe(true);
    }
  });
});
