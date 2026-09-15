#!/usr/bin/env node
/**
 * Builds `src/graphics/data/earth-coastlines.ts`, the vector coastline
 * set the strategic map draws (#1144), from Natural Earth's public-domain
 * 1:110m land polygons. Deterministic: the same download and tolerance
 * reproduce the same module byte for byte.
 *
 *   node tools/art/build-coastlines.mjs            # downloads, simplifies, writes
 *   node tools/art/build-coastlines.mjs 0.2        # a different tolerance, in degrees
 *
 * Pipeline:
 *
 * ```
 *   GeoJSON land polygons ──▶ Douglas–Peucker (TOLERANCE_DEG) ──▶ round to
 *   0.01° ──▶ drop degenerate rings ──▶ closed rings in [lon, lat] ──▶ TS
 * ```
 *
 * Only the *land* theme is used. Its ring edges are the coastline, and the
 * rings themselves give the point-in-polygon test that keeps city markers
 * on drawn land, so the separate coastline theme would add nothing but
 * bytes. Natural Earth splits nothing at the antimeridian in this theme:
 * Antarctica runs the full −180…180 with an edge along −90, and the
 * renderer drops segments that lie on the map border rather than this
 * script (`src/graphics/view/earth-wireframe.ts`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ===========================================
// Constants
// ===========================================

/** Natural Earth 1:110m land, public domain, from the maintainer's GeoJSON mirror. */
const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";

/**
 * Douglas–Peucker tolerance in degrees. The map is equirectangular, so a
 * degree is the same distance in both axes: 0.1° is a quarter of a pixel
 * at the widest overworld zoom and just over one at the tightest, which
 * keeps every island the 110m set has while dropping vertices no zoom
 * can see.
 */
const DEFAULT_TOLERANCE_DEG = 0.1;

/** Coordinates are written to this many decimals (0.01° ≈ 1 km). */
const DECIMALS = 2;

/** A ring needs three distinct corners plus its closing point to enclose anything. */
const MIN_RING_POINTS = 4;

/** Points per source line in the generated module. */
const POINTS_PER_LINE = 6;

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/graphics/data/earth-coastlines.ts",
);

// ===========================================
// Download
// ===========================================

/**
 * Fetches the source GeoJSON, caching it under the OS temp directory so a
 * re-run with another tolerance does not hit the network again.
 * @returns The parsed FeatureCollection.
 */
async function loadSource() {
  const cacheDir = join(tmpdir(), "tut-natural-earth");
  const cached = join(cacheDir, "ne_110m_land.geojson");
  try {
    return JSON.parse(readFileSync(cached, "utf8"));
  } catch {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(`${SOURCE_URL}: HTTP ${String(response.status)}`);
    }
    const text = await response.text();
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cached, text);
    return JSON.parse(text);
  }
}

// ===========================================
// Simplification
// ===========================================

/**
 * Perpendicular distance from `p` to the segment `a`–`b`, in degrees.
 * @param {number[]} p - Point.
 * @param {number[]} a - Segment start.
 * @param {number[]} b - Segment end.
 * @returns {number} The distance.
 */
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
  }
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas–Peucker on an open polyline: keeps the end points and every
 * vertex further than `tolerance` from the chord of its span.
 * @param {number[][]} points - The polyline.
 * @param {number} tolerance - Distance in degrees.
 * @returns {number[][]} The kept points, in order.
 */
function simplify(points, tolerance) {
  if (points.length < 3) {
    return points;
  }
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let farthestDistance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const distance = segmentDistance(points[i], points[first], points[last]);
      if (distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/**
 * Simplifies a closed ring: the closing point anchors both ends, the
 * result is rounded, consecutive duplicates are merged and the ring is
 * closed again. Rings that no longer enclose anything come back empty.
 * @param {number[][]} ring - A closed GeoJSON ring.
 * @param {number} tolerance - Distance in degrees.
 * @returns {number[][]} The simplified closed ring, or `[]`.
 */
function simplifyRing(ring, tolerance) {
  const rounded = simplify(ring, tolerance).map(([lon, lat]) => [
    Number(lon.toFixed(DECIMALS)),
    Number(lat.toFixed(DECIMALS)),
  ]);
  const distinct = [];
  for (const point of rounded) {
    const previous = distinct[distinct.length - 1];
    if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
      distinct.push(point);
    }
  }
  const first = distinct[0];
  const last = distinct[distinct.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    distinct.push(first);
  }
  return distinct.length >= MIN_RING_POINTS ? distinct : [];
}

// ===========================================
// Output
// ===========================================

/**
 * Formats a ring as TypeScript source, several points per line.
 * @param {number[][]} ring - Closed ring.
 * @param {string} indent - Leading whitespace for each line.
 * @returns {string} The array literal.
 */
function formatRing(ring, indent) {
  const lines = [];
  for (let i = 0; i < ring.length; i += POINTS_PER_LINE) {
    const chunk = ring
      .slice(i, i + POINTS_PER_LINE)
      .map(([lon, lat]) => `[${String(lon)}, ${String(lat)}]`)
      .join(", ");
    lines.push(`${indent}  ${chunk},`);
  }
  return `[\n${lines.join("\n")}\n${indent}]`;
}

/**
 * Writes the generated module.
 * @param {{outer: number[][], holes: number[][][]}[]} polygons - Simplified land.
 * @param {number} tolerance - The tolerance used, recorded in the module.
 */
function writeModule(polygons, tolerance) {
  const body = polygons
    .map((polygon) => {
      const holes =
        polygon.holes.length === 0
          ? "[]"
          : `[\n${polygon.holes.map((hole) => `      ${formatRing(hole, "      ")},`).join("\n")}\n    ]`;
      return `    {\n      outer: ${formatRing(polygon.outer, "      ")},\n      holes: ${holes},\n    },`;
    })
    .join("\n");
  const source = `/**
 * Generated by \`tools/art/build-coastlines.mjs\`; do not edit by hand.
 *
 * Natural Earth 1:110m land polygons (public domain), simplified with
 * Douglas–Peucker at ${String(tolerance)}° and rounded to ${String(DECIMALS)} decimals. Every ring
 * is closed and given as \`[longitude, latitude]\`; the strategic map
 * projects them with the same equirectangular mapping the cities use.
 */
import type { EarthCoastlines } from "../model/earth-coastlines";

// prettier-ignore
export const EARTH_COASTLINES: EarthCoastlines = {
  source: "${SOURCE_URL}",
  toleranceDeg: ${String(tolerance)},
  polygons: [
${body}
  ],
};
`;
  writeFileSync(OUTPUT, source);
}

// ===========================================
// Main
// ===========================================

/** Runs the build and prints what it kept. */
async function main() {
  const tolerance = Number(process.argv[2] ?? DEFAULT_TOLERANCE_DEG);
  if (!(tolerance >= 0)) {
    throw new Error(
      `Tolerance must be a non-negative number of degrees, got ${String(process.argv[2])}`,
    );
  }
  const collection = await loadSource();
  const polygons = [];
  let sourcePoints = 0;
  for (const feature of collection.features) {
    const { geometry } = feature;
    const shapes =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    for (const rings of shapes) {
      sourcePoints += rings.reduce((sum, ring) => sum + ring.length, 0);
      const [outer, ...holes] = rings.map((ring) =>
        simplifyRing(ring, tolerance),
      );
      if (outer.length === 0) {
        continue;
      }
      polygons.push({ outer, holes: holes.filter((hole) => hole.length > 0) });
    }
  }
  // Largest land masses first, so the reader meets the continents before the islands.
  polygons.sort((a, b) => b.outer.length - a.outer.length);
  writeModule(polygons, tolerance);
  const kept = polygons.reduce(
    (sum, polygon) =>
      sum +
      polygon.outer.length +
      polygon.holes.reduce((h, hole) => h + hole.length, 0),
    0,
  );
  console.log(
    `${String(polygons.length)} polygons, ${String(kept)} of ${String(sourcePoints)} points at ${String(tolerance)}°, ${String(readFileSync(OUTPUT).length)} bytes → ${OUTPUT}`,
  );
}

await main();
