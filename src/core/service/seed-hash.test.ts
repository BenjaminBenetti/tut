import { describe, expect, it } from "vitest";

import { hashSeed } from "./seed-hash";

describe("hashSeed", () => {
  it("is deterministic", () => {
    expect(hashSeed("terra-01")).toBe(hashSeed("terra-01"));
  });

  it("distinguishes similar inputs", () => {
    expect(hashSeed("terra-01")).not.toBe(hashSeed("terra-02"));
    expect(hashSeed("")).not.toBe(hashSeed(" "));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const text of ["", "a", "terra under threat", "🐛"]) {
      const value = hashSeed(text);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
