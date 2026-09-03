import { describe, expect, it } from "vitest";

import { nextSeed } from "./seed-sequence";

describe("nextSeed", () => {
  it("increments a trailing number and keeps its padding", () => {
    expect(nextSeed("terra-01")).toBe("terra-02");
    expect(nextSeed("terra-09")).toBe("terra-10");
    expect(nextSeed("seed9")).toBe("seed10");
    expect(nextSeed("007")).toBe("008");
    expect(nextSeed("99")).toBe("100");
  });

  it("appends -2 when there is no trailing number", () => {
    expect(nextSeed("coast")).toBe("coast-2");
    expect(nextSeed("")).toBe("-2");
    expect(nextSeed("coast-2")).toBe("coast-3");
  });
});
