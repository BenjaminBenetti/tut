import { describe, expect, it } from "vitest";

import { BREACHING_CHARGE } from "../../tactical/data/equipment";
import { chargeDelayText } from "./charge-delay-text";

describe("chargeDelayText (#1134)", () => {
  it("says next turn for one and counts turns otherwise", () => {
    expect(chargeDelayText(1)).toBe("next turn");
    expect(chargeDelayText(2)).toBe("in 2 turns");
    expect(chargeDelayText(3)).toBe("in 3 turns");
  });

  it("names the shipped breaching charge's delay from its definition", () => {
    expect(chargeDelayText(BREACHING_CHARGE.delayTurns ?? 1)).toBe(
      "in 2 turns",
    );
  });
});
