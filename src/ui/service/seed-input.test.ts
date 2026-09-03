import { describe, expect, it } from "vitest";

import { hashSeed } from "../../core/service/seed-hash";
import { resolveSeed } from "./seed-input";

const fallback = (): number => 4242;

describe("resolveSeed", () => {
  it("uses the fallback for blank input", () => {
    expect(resolveSeed("", fallback)).toBe(4242);
    expect(resolveSeed("   ", fallback)).toBe(4242);
  });

  it("uses an in-range number verbatim, ignoring surrounding whitespace", () => {
    expect(resolveSeed("12345", fallback)).toBe(12345);
    expect(resolveSeed(" 0 ", fallback)).toBe(0);
    expect(resolveSeed("4294967295", fallback)).toBe(4294967295);
  });

  it("hashes text and out-of-range numbers", () => {
    expect(resolveSeed("terra-01", fallback)).toBe(hashSeed("terra-01"));
    expect(resolveSeed("4294967296", fallback)).toBe(hashSeed("4294967296"));
    expect(resolveSeed("-5", fallback)).toBe(hashSeed("-5"));
    expect(resolveSeed("1e3", fallback)).toBe(hashSeed("1e3"));
  });

  it("always yields an unsigned 32-bit integer", () => {
    for (const text of ["", "7", "hello world", "99999999999999"]) {
      const seed = resolveSeed(text, fallback);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
