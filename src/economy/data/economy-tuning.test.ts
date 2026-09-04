import { describe, expect, it } from "vitest";

import { ECONOMY_TUNING } from "./economy-tuning";

describe("economy tuning", () => {
  it("uses non-negative whole credits everywhere", () => {
    const { startingCredits, baseStipend, stipendFloor } = ECONOMY_TUNING;
    for (const value of [startingCredits, baseStipend, stipendFloor]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the stipend floor at or below the base stipend", () => {
    expect(ECONOMY_TUNING.stipendFloor).toBeLessThanOrEqual(
      ECONOMY_TUNING.baseStipend,
    );
  });

  // There was a third case here, asserting the bundle held the same
  // values as the scalars exported beside it. With the scalars gone
  // (#141) there is one source and it would read `expect(X).toEqual(X)`,
  // so it is deleted rather than kept as a test that cannot fail.
});
