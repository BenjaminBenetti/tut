import { describe, expect, it } from "vitest";

import { randomSeed } from "./random-seed";

describe("randomSeed", () => {
  it("returns unsigned 32-bit integers", () => {
    for (let i = 0; i < 100; i++) {
      const value = randomSeed();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
