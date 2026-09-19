import { describe, expect, it } from "vitest";

import {
  formatCredits,
  formatTechPoints,
  formatPopulation,
  formatWhole,
} from "./format";

describe("format", () => {
  it("prefixes credits with ¢ and groups thousands", () => {
    expect(formatCredits(5000)).toBe("¢5,000");
    expect(formatCredits(0)).toBe("¢0");
    expect(formatCredits(1234567.6)).toBe("¢1,234,568");
  });

  it("rounds gauges to whole numbers", () => {
    expect(formatWhole(41.6)).toBe("42");
    expect(formatWhole(0)).toBe("0");
  });

  it("abbreviates populations to one decimal of millions or thousands (#1154)", () => {
    expect(formatPopulation(37_000_000)).toBe("37M");
    expect(formatPopulation(9_700_000)).toBe("9.7M");
    expect(formatPopulation(1_000_000)).toBe("1M");
    expect(formatPopulation(999_999)).toBe("1000K");
    expect(formatPopulation(640_000)).toBe("640K");
    expect(formatPopulation(2_500)).toBe("2.5K");
    expect(formatPopulation(850)).toBe("850");
    expect(formatPopulation(0)).toBe("0");
    expect(formatPopulation(-3)).toBe("0");
  });
});

describe("formatTechPoints", () => {
  it("prints a whole count with the TP unit and thousands separators (#1171)", () => {
    expect(formatTechPoints(0)).toBe("0 TP");
    expect(formatTechPoints(42)).toBe("42 TP");
    expect(formatTechPoints(1024.4)).toBe("1,024 TP");
  });
});
