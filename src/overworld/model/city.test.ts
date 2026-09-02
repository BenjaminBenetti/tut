import { describe, expect, it } from "vitest";

import { clampInfestation, MAX_INFESTATION, MIN_INFESTATION } from "./city";

describe("clampInfestation", () => {
  it("passes in-range values through unchanged", () => {
    expect(clampInfestation(0)).toBe(MIN_INFESTATION);
    expect(clampInfestation(42)).toBe(42);
    expect(clampInfestation(100)).toBe(MAX_INFESTATION);
  });

  it("clamps values outside the bounds", () => {
    expect(clampInfestation(-7)).toBe(MIN_INFESTATION);
    expect(clampInfestation(250)).toBe(MAX_INFESTATION);
  });

  it("normalises negative zero to zero", () => {
    expect(Object.is(clampInfestation(-0), 0)).toBe(true);
  });
});
