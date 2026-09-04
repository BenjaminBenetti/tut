import { describe, expect, it } from "vitest";

import { parseDebugOptions } from "./debug-options";

describe("parseDebugOptions", () => {
  it("returns undefined for an empty or unrelated query", () => {
    expect(parseDebugOptions("")).toBeUndefined();
    expect(parseDebugOptions("?seed=4")).toBeUndefined();
  });

  it("reads a positive threat escalation multiplier", () => {
    expect(parseDebugOptions("?threatEscalation=100")).toEqual({
      threatEscalationMultiplier: 100,
    });
    expect(parseDebugOptions("?a=1&threatEscalation=2.5")).toEqual({
      threatEscalationMultiplier: 2.5,
    });
  });

  it("ignores malformed or non-positive values", () => {
    for (const bad of ["abc", "0", "-3", "Infinity", ""]) {
      expect(parseDebugOptions(`?threatEscalation=${bad}`)).toBeUndefined();
    }
  });

  it("reads the auto-resolve switch, on its own or beside the others", () => {
    for (const on of ["1", "true", "TRUE", ""]) {
      expect(parseDebugOptions(`?autoResolve=${on}`)).toEqual({
        autoResolve: true,
      });
    }
    expect(parseDebugOptions("?autoResolve=1&threatEscalation=4")).toEqual({
      threatEscalationMultiplier: 4,
      autoResolve: true,
    });
  });

  it("leaves auto-resolve off unless it is asked for", () => {
    for (const off of ["0", "false", "no"]) {
      expect(parseDebugOptions(`?autoResolve=${off}`)).toBeUndefined();
    }
  });
});
