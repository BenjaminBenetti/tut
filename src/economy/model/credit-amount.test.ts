import { describe, expect, it } from "vitest";

import { assertWholeCredits, isWholeCredits } from "./credit-amount";

describe("credit amount guards", () => {
  it("accepts zero and positive integers", () => {
    for (const value of [0, 1, 5000, Number.MAX_SAFE_INTEGER]) {
      expect(isWholeCredits(value)).toBe(true);
      expect(() => assertWholeCredits(value, "amount")).not.toThrow();
    }
  });

  it("rejects negative, fractional and non-finite values", () => {
    for (const value of [
      -1,
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(isWholeCredits(value)).toBe(false);
      expect(() => assertWholeCredits(value, "amount")).toThrow(RangeError);
    }
  });

  it("names the offending parameter in the error", () => {
    expect(() => assertWholeCredits(-3, "price")).toThrow(/price -3/);
  });
});
