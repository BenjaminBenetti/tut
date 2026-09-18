import { describe, expect, it } from "vitest";
import { mapInfestationLevel } from "./map-infestation";

describe("map infestation bands", () => {
  it.each([
    [0, 0],
    [9.9, 0],
    [10, 1],
    [39.9, 3],
    [40, 4],
    [49.9, 4],
    [99, 9],
    [100, 10],
    [-1, 0],
    [120, 10],
    [NaN, 0],
  ])("maps %s overworld points to level %s", (points, level) => {
    expect(mapInfestationLevel(points)).toBe(level);
  });
});
