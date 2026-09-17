import { describe, expect, it } from "vitest";

import type { GroundPoint, GroundPolygon } from "./coastline-projection";
import {
  clipLandToConvex,
  clipPolygonToConvex,
  clipSegmentToLand,
  triangulateLand,
} from "./land-clipping";
import { signedArea } from "./region-territory-service";

// ===========================================
// Fixtures
// ===========================================

/** A 10×10 island from (2,2) with a 2×2 lake from (5,5). */
const ISLAND: GroundPolygon = {
  outer: [
    { x: 2, z: 2 },
    { x: 12, z: 2 },
    { x: 12, z: 12 },
    { x: 2, z: 12 },
    { x: 2, z: 2 },
  ],
  holes: [
    [
      { x: 5, z: 5 },
      { x: 7, z: 5 },
      { x: 7, z: 7 },
      { x: 5, z: 7 },
      { x: 5, z: 5 },
    ],
  ],
};

/** Area covered by convex pieces, summed. */
function areaOf(pieces: readonly (readonly GroundPoint[])[]): number {
  return pieces.reduce((sum, piece) => sum + Math.abs(signedArea(piece)), 0);
}

// ===========================================
// Tests
// ===========================================

describe("land clipping", () => {
  it("triangulates land with its inland seas cut out", () => {
    const triangles = triangulateLand([ISLAND]);
    expect(triangles.length).toBeGreaterThan(0);
    expect(areaOf(triangles)).toBeCloseTo(100 - 4, 6);
    for (const triangle of triangles) {
      expect(signedArea(triangle)).toBeGreaterThan(0);
    }
  });

  it("clips a polygon to a convex one, whichever way either is wound", () => {
    const square = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 4 },
      { x: 0, z: 4 },
    ];
    const window = [
      { x: 2, z: 2 },
      { x: 6, z: 2 },
      { x: 6, z: 6 },
      { x: 2, z: 6 },
    ];
    const clipped = clipPolygonToConvex(square, window);
    expect(Math.abs(signedArea(clipped))).toBeCloseTo(4, 6);
    const reversed = clipPolygonToConvex(
      [...square].reverse(),
      [...window].reverse(),
    );
    expect(Math.abs(signedArea(reversed))).toBeCloseTo(4, 6);
    expect(
      clipPolygonToConvex(square, [
        { x: 10, z: 10 },
        { x: 12, z: 10 },
        { x: 12, z: 12 },
      ]),
    ).toEqual([]);
  });

  it("cuts land into pieces that tile a cell exactly, and none at sea", () => {
    const triangles = triangulateLand([ISLAND]);
    // A cell covering the island's left half, lake half included.
    const leftHalf = [
      { x: 0, z: 0 },
      { x: 6, z: 0 },
      { x: 6, z: 20 },
      { x: 0, z: 20 },
    ];
    const pieces = clipLandToConvex(triangles, leftHalf);
    expect(areaOf(pieces)).toBeCloseTo(4 * 10 - 1 * 2, 6);
    for (const piece of pieces) {
      expect(signedArea(piece)).toBeGreaterThan(0);
      for (const point of piece) {
        expect(point.x).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(point.x).toBeLessThanOrEqual(6 + 1e-9);
      }
    }
    const atSea = [
      { x: 14, z: 0 },
      { x: 20, z: 0 },
      { x: 20, z: 20 },
      { x: 14, z: 20 },
    ];
    expect(clipLandToConvex(triangles, atSea)).toEqual([]);
  });

  it("keeps the on-land parts of a segment: across the coast, over the lake, at sea", () => {
    const acrossCoast = clipSegmentToLand(
      { a: { x: 0, z: 3 }, b: { x: 4, z: 3 } },
      [ISLAND],
    );
    expect(acrossCoast).toHaveLength(1);
    expect(acrossCoast[0]?.a).toEqual({ x: 2, z: 3 });
    expect(acrossCoast[0]?.b).toEqual({ x: 4, z: 3 });

    const overLake = clipSegmentToLand(
      { a: { x: 3, z: 6 }, b: { x: 9, z: 6 } },
      [ISLAND],
    );
    expect(overLake).toHaveLength(2);
    expect(overLake[0]?.b.x).toBeCloseTo(5);
    expect(overLake[1]?.a.x).toBeCloseTo(7);

    expect(
      clipSegmentToLand({ a: { x: 0, z: 0 }, b: { x: 1, z: 1 } }, [ISLAND]),
    ).toEqual([]);
    expect(
      clipSegmentToLand({ a: { x: 3, z: 3 }, b: { x: 4, z: 4 } }, [ISLAND]),
    ).toEqual([{ a: { x: 3, z: 3 }, b: { x: 4, z: 4 } }]);
  });
});
