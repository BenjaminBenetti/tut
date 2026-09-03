import { describe, expect, it } from "vitest";

import { formatCredits, formatWhole } from "./format";

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
});
