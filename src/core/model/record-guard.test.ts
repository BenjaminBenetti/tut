import { describe, expect, it } from "vitest";

import { isRecord } from "./record-guard";

describe("isRecord", () => {
  it("accepts plain objects, including empty and prototype-less ones", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("rejects null, arrays and primitives", () => {
    for (const value of [
      null,
      undefined,
      [],
      [1],
      "x",
      0,
      1,
      true,
      Symbol("s"),
    ]) {
      expect(isRecord(value), String(typeof value)).toBe(false);
    }
  });

  it("narrows so fields can be read without a cast", () => {
    const value: unknown = { meta: { seed: 3 } };
    if (!isRecord(value) || !isRecord(value.meta)) {
      throw new Error("expected a record");
    }
    expect(value.meta.seed).toBe(3);
  });
});
