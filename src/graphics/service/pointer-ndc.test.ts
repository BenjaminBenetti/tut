import { describe, expect, it } from "vitest";

import { ndcToPointer, pointerToNdc } from "./pointer-ndc";

const RECT = { left: 100, top: 50, width: 800, height: 400 };

describe("pointer-ndc", () => {
  it("maps the rect corners to ±1 with +y up", () => {
    expect(pointerToNdc(RECT, 100, 50)).toEqual({ x: -1, y: 1 });
    expect(pointerToNdc(RECT, 900, 450)).toEqual({ x: 1, y: -1 });
    expect(pointerToNdc(RECT, 500, 250)).toEqual({ x: 0, y: 0 });
  });

  it("round-trips through ndcToPointer", () => {
    for (const [x, y] of [
      [123, 77],
      [500, 250],
      [899, 449],
    ] as const) {
      const back = ndcToPointer(RECT, pointerToNdc(RECT, x, y));
      expect(back.x).toBeCloseTo(x);
      expect(back.y).toBeCloseTo(y);
    }
  });
});
