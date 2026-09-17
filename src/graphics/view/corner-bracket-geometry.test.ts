import { describe, expect, it } from "vitest";

import { cornerBracketGeometry } from "./corner-bracket-geometry";

describe("cornerBracketGeometry (#1155)", () => {
  it("draws eight quads that stay inside the square and touch its four corners", () => {
    const geometry = cornerBracketGeometry(0.4, 0.1, 0.02);
    const position = geometry.getAttribute("position");
    expect(position.count).toBe(8 * 6);
    let corners = 0;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.4 + 1e-6);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.4 + 1e-6);
      expect(position.getZ(i)).toBe(0);
      if (
        Math.abs(Math.abs(x) - 0.4) < 1e-6 &&
        Math.abs(Math.abs(y) - 0.4) < 1e-6
      ) {
        corners += 1;
      }
    }
    // Each corner vertex appears in both of its arms at least once.
    expect(corners).toBeGreaterThanOrEqual(4 * 2);
    // No vertex lies in the open middle of a side: the arms are short.
    for (let i = 0; i < position.count; i++) {
      const inner = Math.min(
        Math.abs(position.getX(i)),
        Math.abs(position.getY(i)),
      );
      expect(inner).toBeGreaterThanOrEqual(0.4 - 0.1 - 1e-6);
    }
  });
});
