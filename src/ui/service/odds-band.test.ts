import { describe, expect, it } from "vitest";

import { formatOdds, ODDS_BAND_LOWER, oddsTone } from "./odds-band";

describe("oddsTone", () => {
  it("is green from the upper bound, amber from the lower, red below", () => {
    expect(oddsTone(1)).toBe("ok");
    expect(oddsTone(ODDS_BAND_LOWER.ok)).toBe("ok");
    expect(oddsTone(ODDS_BAND_LOWER.ok - 0.01)).toBe("warn");
    expect(oddsTone(ODDS_BAND_LOWER.warn)).toBe("warn");
    expect(oddsTone(ODDS_BAND_LOWER.warn - 0.01)).toBe("danger");
    expect(oddsTone(0)).toBe("danger");
  });
});

describe("formatOdds", () => {
  it("rounds to a whole percentage", () => {
    expect(formatOdds(0.734)).toBe("73 %");
    expect(formatOdds(0)).toBe("0 %");
    expect(formatOdds(1)).toBe("100 %");
  });
});
