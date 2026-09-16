import { describe, expect, it } from "vitest";

import type { GroundPolygon, GroundRing } from "./coastline-projection";
import {
  distanceToLand,
  distanceToRing,
  isInsideRing,
  isOnLand,
} from "./land-query";

/** A closed axis-aligned square ring. */
function square(x0: number, z0: number, x1: number, z1: number): GroundRing {
  return [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
    { x: x0, z: z0 },
  ];
}

const ISLAND: GroundPolygon = { outer: square(2, 2, 6, 6), holes: [] };
const WITH_LAKE: GroundPolygon = {
  outer: square(10, 0, 20, 10),
  holes: [square(14, 4, 16, 6)],
};

describe("land-query", () => {
  it("tells inside from outside a ring, either winding", () => {
    expect(isInsideRing({ x: 4, z: 4 }, ISLAND.outer)).toBe(true);
    expect(isInsideRing({ x: 1, z: 4 }, ISLAND.outer)).toBe(false);
    expect(isInsideRing({ x: 4, z: 7 }, ISLAND.outer)).toBe(false);
    const reversed = [...ISLAND.outer].reverse();
    expect(isInsideRing({ x: 4, z: 4 }, reversed)).toBe(true);
    expect(isInsideRing({ x: 7, z: 4 }, reversed)).toBe(false);
  });

  it("measures the distance to the nearest edge", () => {
    expect(distanceToRing({ x: 0, z: 4 }, ISLAND.outer)).toBe(2);
    expect(distanceToRing({ x: 9, z: 9 }, ISLAND.outer)).toBeCloseTo(
      Math.hypot(3, 3),
    );
    expect(distanceToRing({ x: 4, z: 4 }, ISLAND.outer)).toBe(2);
    expect(distanceToRing({ x: 0, z: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts an inland sea as water", () => {
    expect(isOnLand({ x: 12, z: 2 }, [ISLAND, WITH_LAKE])).toBe(true);
    expect(isOnLand({ x: 15, z: 5 }, [ISLAND, WITH_LAKE])).toBe(false);
    expect(isOnLand({ x: 8, z: 8 }, [ISLAND, WITH_LAKE])).toBe(false);
  });

  it("is zero on land and the shore distance off it", () => {
    const land = [ISLAND, WITH_LAKE];
    expect(distanceToLand({ x: 3, z: 3 }, land)).toBe(0);
    expect(distanceToLand({ x: 8, z: 4 }, land)).toBe(2);
    // Inside the lake: the nearest shore is the lake's own.
    expect(distanceToLand({ x: 15, z: 5 }, land)).toBe(1);
    expect(distanceToLand({ x: 0, z: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});
