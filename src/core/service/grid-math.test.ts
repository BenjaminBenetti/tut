import { describe, expect, it } from "vitest";

import { DIRECTIONS } from "../model/direction";
import {
  addGridPos,
  chebyshevDistance,
  directionOffset,
  gridKey,
  gridPosEquals,
  isInBounds,
  manhattanDistance,
  oppositeDirection,
  rectContains,
  rectsOverlap,
  stepGridPos,
} from "./grid-math";

describe("grid-math", () => {
  it("direction offsets are unit steps and opposites cancel", () => {
    for (const direction of DIRECTIONS) {
      const offset = directionOffset(direction);
      expect(manhattanDistance({ x: 0, y: 0, z: 0 }, offset)).toBe(1);
      expect(offset.y).toBe(0);
      const back = addGridPos(
        offset,
        directionOffset(oppositeDirection(direction)),
      );
      expect(gridPosEquals(back, { x: 0, y: 0, z: 0 })).toBe(true);
    }
  });

  it("north is -z and east is +x", () => {
    expect(stepGridPos({ x: 2, y: 1, z: 2 }, "n")).toEqual({
      x: 2,
      y: 1,
      z: 1,
    });
    expect(stepGridPos({ x: 2, y: 1, z: 2 }, "e")).toEqual({
      x: 3,
      y: 1,
      z: 2,
    });
  });

  it("distances ignore level", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 3, y: 5, z: 4 };
    expect(manhattanDistance(a, b)).toBe(7);
    expect(chebyshevDistance(a, b)).toBe(4);
  });

  it("gridKey is unique across a small grid and rejects out-of-bounds", () => {
    const width = 3;
    const depth = 2;
    const seen = new Set<number>();
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < depth; z++) {
        for (let x = 0; x < width; x++) {
          seen.add(gridKey({ x, y, z }, width, depth));
        }
      }
    }
    expect(seen.size).toBe(12);
    expect(() => gridKey({ x: 3, y: 0, z: 0 }, width, depth)).toThrow();
    expect(() => gridKey({ x: 0, y: -1, z: 0 }, width, depth)).toThrow();
    expect(() => gridKey({ x: 0.5, y: 0, z: 0 }, width, depth)).toThrow();
  });

  it("isInBounds checks x and z against the grid and y against zero", () => {
    expect(isInBounds({ x: 0, y: 0, z: 0 }, 4, 4)).toBe(true);
    expect(isInBounds({ x: 3, y: 9, z: 3 }, 4, 4)).toBe(true);
    expect(isInBounds({ x: 4, y: 0, z: 0 }, 4, 4)).toBe(false);
    expect(isInBounds({ x: 0, y: 0, z: -1 }, 4, 4)).toBe(false);
  });

  it("rect helpers use half-open extents", () => {
    const rect = { x: 2, z: 2, w: 3, d: 2 };
    expect(rectContains(rect, 2, 2)).toBe(true);
    expect(rectContains(rect, 4, 3)).toBe(true);
    expect(rectContains(rect, 5, 3)).toBe(false);
    expect(rectsOverlap(rect, { x: 4, z: 3, w: 1, d: 1 })).toBe(true);
    expect(rectsOverlap(rect, { x: 5, z: 2, w: 1, d: 1 })).toBe(false);
  });
});
