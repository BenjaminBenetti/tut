import { describe, expect, it } from "vitest";
import {
  infestationLevelFromMeter,
  isInfestationLevel,
} from "./infestation-level";

describe("infestation levels", () => {
  it.each([
    [0, 0],
    [1, 1],
    [10, 1],
    [11, 2],
    [50, 5],
    [91, 10],
    [100, 10],
    [-2, 0],
    [120, 10],
    [NaN, 0],
  ])("maps meter %s to level %s", (meter, level) =>
    expect(infestationLevelFromMeter(meter)).toBe(level),
  );
  it("accepts only the eleven integer positions", () => {
    for (let n = 0; n <= 10; n++) expect(isInfestationLevel(n)).toBe(true);
    for (const n of [-1, 11, 1.1, NaN, Infinity])
      expect(isInfestationLevel(n)).toBe(false);
  });
});
