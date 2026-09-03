#!/usr/bin/env node
/**
 * Builds the first-pass unit texture atlases for the placeholder models:
 *
 *   public/assets/textures/units/tdf-atlas_albedo.png   (TDF armour, cloth, markings)
 *   public/assets/textures/units/bug-atlas_albedo.png   (chitin, flesh, bioluminescence, bone)
 *
 * Each atlas is a 4×4 grid of 128 px cells, one per palette token, drawn
 * procedurally (seams, rivets, chitin plates, veins) from a seeded PRNG so
 * re-running reproduces identical bytes. `build-placeholders.mjs` maps each
 * mesh's UVs into the cell of its material token and references the atlas
 * from the GLB as an external image.
 *
 *   token ──► cell (col,row) ──► painter(token) ──► RGB pixels ──► PNG (zlib)
 *
 * No Math.random(): all variation comes from `Rng` seeded per cell.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ===========================================
// Layout
// ===========================================

/** Atlas grid: 4×4 cells of CELL px → 512 px square. */
export const GRID = 4;
export const CELL = 128;
export const ATLAS_SIZE = GRID * CELL;

/**
 * Token → atlas and cell. Shared with `build-placeholders.mjs`, which
 * imports it to remap UVs; keep the two files in step.
 * @type {Record<string, {atlas: "tdf"|"bug", col: number, row: number, hex: string, style: string}>}
 */
export const ATLAS_CELLS = {
  "tdf-grey-dark": {
    atlas: "tdf",
    col: 0,
    row: 0,
    hex: "#2E3440",
    style: "armour",
  },
  "tdf-grey-mid": {
    atlas: "tdf",
    col: 1,
    row: 0,
    hex: "#5B6573",
    style: "armour",
  },
  "tdf-grey-light": {
    atlas: "tdf",
    col: 2,
    row: 0,
    hex: "#9AA5B1",
    style: "armour",
  },
  "tdf-olive": { atlas: "tdf", col: 3, row: 0, hex: "#6B7A3F", style: "cloth" },
  "tdf-olive-dark": {
    atlas: "tdf",
    col: 0,
    row: 1,
    hex: "#45502A",
    style: "cloth",
  },
  "tdf-orange": {
    atlas: "tdf",
    col: 1,
    row: 1,
    hex: "#F08A24",
    style: "decal",
  },
  "tdf-orange-dim": {
    atlas: "tdf",
    col: 2,
    row: 1,
    hex: "#B86414",
    style: "decal",
  },
  "tdf-visor": { atlas: "tdf", col: 3, row: 1, hex: "#7FD1FF", style: "glass" },
  "bug-chitin-black": {
    atlas: "bug",
    col: 0,
    row: 0,
    hex: "#14121A",
    style: "chitin",
  },
  "bug-chitin-dark": {
    atlas: "bug",
    col: 1,
    row: 0,
    hex: "#2B2436",
    style: "chitin",
  },
  "bug-chitin-mid": {
    atlas: "bug",
    col: 2,
    row: 0,
    hex: "#4A3B5A",
    style: "chitin",
  },
  "bug-flesh": { atlas: "bug", col: 3, row: 0, hex: "#7A3A4E", style: "flesh" },
  "bug-flesh-light": {
    atlas: "bug",
    col: 0,
    row: 1,
    hex: "#B05A6E",
    style: "flesh",
  },
  "bug-bio-green": {
    atlas: "bug",
    col: 1,
    row: 1,
    hex: "#9CFF3D",
    style: "glow",
  },
  "bug-bio-green-dim": {
    atlas: "bug",
    col: 2,
    row: 1,
    hex: "#4C8F1A",
    style: "residue",
  },
  "bug-bio-magenta": {
    atlas: "bug",
    col: 3,
    row: 1,
    hex: "#E23DFF",
    style: "glow",
  },
  "bug-bone": { atlas: "bug", col: 0, row: 2, hex: "#D8CBB0", style: "bone" },
};

/** Atlas id → output path under `public/`. */
export const ATLAS_PATHS = {
  tdf: "assets/textures/units/tdf-atlas_albedo.png",
  bug: "assets/textures/units/bug-atlas_albedo.png",
};

// ===========================================
// Seeded randomness and noise
// ===========================================

/** Small deterministic PRNG (xorshift32). */
class Rng {
  /**
   * @param {number} seed - Non-zero 32-bit seed.
   */
  constructor(seed) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /**
   * Next float in [0, 1).
   * @returns {number} Uniform sample.
   */
  next() {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x / 0x100000000;
  }

  /**
   * Float in [min, max).
   * @param {number} min - Lower bound.
   * @param {number} max - Upper bound.
   * @returns {number} Uniform sample.
   */
  range(min, max) {
    return min + (max - min) * this.next();
  }
}

/**
 * Value noise on a wrapping lattice so cells tile across box faces.
 * @param {Rng} rng - Seed source for the lattice.
 * @param {number} period - Lattice points per cell edge.
 * @returns {(x: number, y: number) => number} Sampler in [0, 1] taking cell-space pixels.
 */
function makeNoise(rng, period) {
  const lattice = new Float32Array(period * period);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const scale = period / CELL;
  return (x, y) => {
    const fx = x * scale;
    const fy = y * scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (ix, iy) =>
      lattice[
        (((iy % period) + period) % period) * period +
          (((ix % period) + period) % period)
      ];
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

// ===========================================
// Pixel helpers
// ===========================================

/**
 * Parses `#RRGGBB` into [r, g, b].
 * @param {string} hex - Colour.
 * @returns {[number, number, number]} Channels 0–255.
 */
function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Clamps and rounds a channel.
 * @param {number} v - Raw value.
 * @returns {number} 0–255 integer.
 */
function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** One cell's RGB scratch buffer with shading helpers. */
class Cell {
  /**
   * @param {[number, number, number]} base - Base colour.
   */
  constructor(base) {
    this.base = base;
    this.px = new Float32Array(CELL * CELL * 3);
    for (let i = 0; i < CELL * CELL; i++) {
      this.px[i * 3] = base[0];
      this.px[i * 3 + 1] = base[1];
      this.px[i * 3 + 2] = base[2];
    }
  }

  /**
   * Multiplies a pixel's brightness (wrapping coordinates).
   * @param {number} x - Column.
   * @param {number} y - Row.
   * @param {number} k - Multiplier.
   */
  mul(x, y, k) {
    const ix = ((Math.round(x) % CELL) + CELL) % CELL;
    const iy = ((Math.round(y) % CELL) + CELL) % CELL;
    const i = (iy * CELL + ix) * 3;
    this.px[i] *= k;
    this.px[i + 1] *= k;
    this.px[i + 2] *= k;
  }

  /**
   * Applies a per-pixel brightness field.
   * @param {(x: number, y: number) => number} field - Multiplier per pixel.
   */
  shade(field) {
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) this.mul(x, y, field(x, y));
    }
  }

  /**
   * Draws a straight line of a given brightness multiplier and thickness.
   * @param {number} x0 - Start column.
   * @param {number} y0 - Start row.
   * @param {number} x1 - End column.
   * @param {number} y1 - End row.
   * @param {number} k - Multiplier.
   * @param {number} [thickness] - Line thickness in px.
   */
  line(x0, y0, x1, y1, k, thickness = 1) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    const half = (thickness - 1) / 2;
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) this.mul(x + dx, y + dy, k);
      }
    }
  }

  /**
   * Fills a small square (rivets, spots).
   * @param {number} cx - Centre column.
   * @param {number} cy - Centre row.
   * @param {number} r - Half size.
   * @param {number} k - Multiplier.
   */
  dot(cx, cy, r, k) {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) this.mul(cx + x, cy + y, k);
  }
}

// ===========================================
// Painters per material style
// ===========================================

/**
 * Armour: panel seams with bevel highlights, rivets at seam corners, faint
 * wear scratches, low-frequency tone variation.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintArmour(cell, rng) {
  const noise = makeNoise(rng, 4);
  cell.shade((x, y) => 0.96 + 0.08 * noise(x, y));
  const seamsX = [Math.round(rng.range(30, 50)), Math.round(rng.range(78, 98))];
  const seamsY = [Math.round(rng.range(30, 50)), Math.round(rng.range(78, 98))];
  for (const sx of seamsX) {
    cell.line(sx, 0, sx, CELL - 1, 0.72, 2);
    cell.line(sx + 2, 0, sx + 2, CELL - 1, 1.12, 1);
  }
  for (const sy of seamsY) {
    cell.line(0, sy, CELL - 1, sy, 0.72, 2);
    cell.line(0, sy + 2, CELL - 1, sy + 2, 1.12, 1);
  }
  for (const sx of seamsX)
    for (const sy of seamsY) cell.dot(sx + 6, sy + 6, 1, 0.6);
  for (let i = 0; i < 5; i++) {
    const x = rng.range(4, CELL - 4);
    const y = rng.range(4, CELL - 4);
    const len = rng.range(6, 18);
    const a = rng.range(0, Math.PI);
    cell.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1.18, 1);
  }
}

/**
 * Cloth: fine weave dither, blotchy tone, one stitch line.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintCloth(cell, rng) {
  const noise = makeNoise(rng, 6);
  cell.shade(
    (x, y) => (0.95 + 0.1 * noise(x, y)) * ((x + y) % 2 === 0 ? 1.02 : 0.98),
  );
  const sy = Math.round(rng.range(28, 40));
  cell.line(0, sy, CELL - 1, sy, 0.8, 1);
  cell.line(0, sy + 3, CELL - 1, sy + 3, 0.8, 1);
}

/**
 * Decal: flat marking with a darker inset border and light wear.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintDecal(cell, rng) {
  const noise = makeNoise(rng, 3);
  cell.shade((x, y) => 0.97 + 0.06 * noise(x, y));
  cell.line(3, 3, CELL - 4, 3, 0.8, 2);
  cell.line(3, CELL - 4, CELL - 4, CELL - 4, 0.8, 2);
  cell.line(3, 3, 3, CELL - 4, 0.8, 2);
  cell.line(CELL - 4, 3, CELL - 4, CELL - 4, 0.8, 2);
}

/**
 * Glass: bright horizontal highlight band on the upper third.
 * @param {Cell} cell - Target.
 */
function paintGlass(cell) {
  cell.shade((_x, y) => (y > 24 && y < 40 ? 1.28 : y > 88 ? 0.85 : 1));
}

/**
 * Chitin: wrapping Voronoi plates with dark cracks and per-plate shading.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintChitin(cell, rng) {
  const points = [];
  for (let i = 0; i < 9; i++)
    points.push([
      rng.range(0, CELL),
      rng.range(0, CELL),
      rng.range(0.82, 1.12),
    ]);
  cell.shade((x, y) => {
    let d1 = Infinity;
    let d2 = Infinity;
    let tone = 1;
    for (const [px, py, t] of points) {
      let dx = Math.abs(x - px);
      let dy = Math.abs(y - py);
      if (dx > CELL / 2) dx = CELL - dx;
      if (dy > CELL / 2) dy = CELL - dy;
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        tone = t;
      } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    if (edge < 2.2) return 0.45;
    if (edge < 4.5) return 0.8;
    return tone * (1 - d1 / 220);
  });
}

/**
 * Flesh: blotchy low-frequency tone with wobbling vein lines.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintFlesh(cell, rng) {
  const noise = makeNoise(rng, 5);
  cell.shade((x, y) => 0.88 + 0.22 * noise(x, y));
  for (let v = 0; v < 3; v++) {
    let x = rng.range(0, CELL);
    let y = rng.range(0, CELL);
    const a = rng.range(0, Math.PI * 2);
    for (let s = 0; s < 60; s++) {
      const nx = x + Math.cos(a + Math.sin(s * 0.3) * 0.6) * 2;
      const ny = y + Math.sin(a + Math.sin(s * 0.3) * 0.6) * 2;
      cell.line(x, y, nx, ny, 0.7, 2);
      x = nx;
      y = ny;
    }
  }
}

/**
 * Glow: emissive surfaces stay nearly flat with a soft radial lift.
 * @param {Cell} cell - Target.
 */
function paintGlow(cell) {
  cell.shade(
    (x, y) =>
      0.94 + 0.12 * (1 - Math.hypot(x - CELL / 2, y - CELL / 2) / (CELL * 0.7)),
  );
}

/**
 * Residue: mottled pools with darker spots.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintResidue(cell, rng) {
  const noise = makeNoise(rng, 7);
  cell.shade((x, y) => 0.8 + 0.35 * noise(x, y));
  for (let i = 0; i < 12; i++)
    cell.dot(
      Math.round(rng.range(2, CELL - 3)),
      Math.round(rng.range(2, CELL - 3)),
      1,
      0.65,
    );
}

/**
 * Bone: pale with fine dark cracks and faint grain.
 * @param {Cell} cell - Target.
 * @param {Rng} rng - Seed.
 */
function paintBone(cell, rng) {
  const noise = makeNoise(rng, 8);
  cell.shade((x, y) => 0.94 + 0.1 * noise(x, y));
  for (let i = 0; i < 4; i++) {
    const x = rng.range(0, CELL);
    const y = rng.range(0, CELL);
    const a = rng.range(-0.5, 0.5) + (i % 2) * Math.PI * 0.5;
    const len = rng.range(20, 50);
    cell.line(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 0.7, 1);
  }
}

/** Style → painter. */
const PAINTERS = {
  armour: paintArmour,
  cloth: paintCloth,
  decal: paintDecal,
  glass: paintGlass,
  chitin: paintChitin,
  flesh: paintFlesh,
  glow: paintGlow,
  residue: paintResidue,
  bone: paintBone,
};

// ===========================================
// PNG encoding
// ===========================================

/** CRC-32 lookup table. */
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/**
 * CRC-32 of a buffer.
 * @param {Buffer} buf - Input.
 * @returns {number} Unsigned CRC.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Builds one PNG chunk.
 * @param {string} type - Four-letter chunk type.
 * @param {Buffer} data - Chunk payload.
 * @returns {Buffer} Length + type + data + CRC.
 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encodes 8-bit RGB pixels as a PNG.
 * @param {Uint8Array} pixels - RGB triplets, row-major.
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @returns {Buffer} PNG file bytes.
 */
function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(
      pixels.subarray(y * width * 3, (y + 1) * width * 3),
      y * (width * 3 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ===========================================
// Build
// ===========================================

/**
 * Paints every cell of one atlas into an RGB buffer.
 * @param {"tdf"|"bug"} atlas - Atlas id.
 * @returns {Uint8Array} RGB pixels, ATLAS_SIZE² × 3.
 */
function paintAtlas(atlas) {
  const pixels = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 3);
  const entries = Object.entries(ATLAS_CELLS).filter(
    ([, c]) => c.atlas === atlas,
  );
  for (const [token, def] of entries) {
    const cell = new Cell(rgb(def.hex));
    let seed = 2166136261;
    for (const ch of token)
      seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    PAINTERS[def.style](cell, new Rng(seed));
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const src = (y * CELL + x) * 3;
        const dst =
          ((def.row * CELL + y) * ATLAS_SIZE + def.col * CELL + x) * 3;
        pixels[dst] = clamp(cell.px[src]);
        pixels[dst + 1] = clamp(cell.px[src + 1]);
        pixels[dst + 2] = clamp(cell.px[src + 2]);
      }
    }
  }
  return pixels;
}

/**
 * Entry point: writes both atlases and prints their sizes.
 */
function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const publicDir = join(here, "..", "..", "public");
  // Cell layout for the Blender pipeline (tools/art/make_model.py reads it).
  writeFileSync(
    join(here, "atlas-cells.json"),
    `${JSON.stringify({ grid: GRID, cell: CELL, inset: 0.03, paths: ATLAS_PATHS, cells: ATLAS_CELLS }, null, 2)}\n`,
  );
  for (const [atlas, rel] of Object.entries(ATLAS_PATHS)) {
    const target = join(publicDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    const png = encodePng(paintAtlas(atlas), ATLAS_SIZE, ATLAS_SIZE);
    writeFileSync(target, png);
    console.log(
      `${atlas.padEnd(4)} ${ATLAS_SIZE}² ${(png.length / 1024).toFixed(1).padStart(6)} KB → ${rel}`,
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
