import { describe, expect, it } from "vitest";

import {
  ECONOMY_TUNING,
  baseStipend,
  startingCredits,
  stipendFloor,
} from "./economy-tuning";

describe("economy tuning", () => {
  it("uses non-negative whole credits everywhere", () => {
    for (const value of [startingCredits, baseStipend, stipendFloor]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the stipend floor at or below the base stipend", () => {
    expect(stipendFloor).toBeLessThanOrEqual(baseStipend);
  });

  it("bundles the same values into ECONOMY_TUNING", () => {
    expect(ECONOMY_TUNING).toEqual({
      startingCredits,
      baseStipend,
      stipendFloor,
    });
  });
});
