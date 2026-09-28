import { describe, expect, it } from "vitest";

import { MECH_SALVAGE_TUNING } from "./mech-salvage-tuning";

describe("mech salvage tuning", () => {
  it("pays back about half a mech, never more than 0.6 of it", () => {
    // Past 0.6 a destroyed mech stops being a loss worth avoiding; that
    // is a design call (#1179), so the data test holds the line.
    expect(MECH_SALVAGE_TUNING.fraction).toBeGreaterThanOrEqual(0.4);
    expect(MECH_SALVAGE_TUNING.fraction).toBeLessThanOrEqual(0.6);
  });
});
