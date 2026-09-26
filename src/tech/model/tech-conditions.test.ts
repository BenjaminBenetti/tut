import { describe, expect, it } from "vitest";

import { KILLED_FLAG_PREFIX, killedFlag } from "./tech-conditions";

// ===========================================
// Killed flags
// ===========================================

describe("killedFlag", () => {
  it("names the species-kill flag an autopsy node requires", () => {
    expect(KILLED_FLAG_PREFIX).toBe("killed:");
    expect(killedFlag("spitter")).toBe("killed:spitter");
  });
});
