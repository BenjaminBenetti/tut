import { describe, expect, it } from "vitest";

import {
  KILLED_FLAG_PREFIX,
  killedFlag,
  killedSpeciesOf,
} from "./tech-conditions";

// ===========================================
// Killed flags
// ===========================================

describe("killedFlag", () => {
  it("names the species-kill flag an autopsy node requires", () => {
    expect(KILLED_FLAG_PREFIX).toBe("killed:");
    expect(killedFlag("spitter")).toBe("killed:spitter");
  });
});

describe("killedSpeciesOf", () => {
  it("reads the species back out of a killed flag, and nothing out of any other flag", () => {
    expect(killedSpeciesOf(killedFlag("spitter"))).toBe("spitter");
    expect(killedSpeciesOf(killedFlag("hive-guard"))).toBe("hive-guard");
    expect(killedSpeciesOf("spore-sample")).toBeUndefined();
    expect(killedSpeciesOf(KILLED_FLAG_PREFIX)).toBeUndefined();
  });
});
