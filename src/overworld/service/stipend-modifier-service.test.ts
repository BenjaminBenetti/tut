import { describe, expect, it } from "vitest";

import {
  stipendFactor,
  tickStipendModifiers,
} from "./stipend-modifier-service";

describe("stipendFactor", () => {
  it("is 1 with no modifiers and multiplies overlapping windows", () => {
    expect(stipendFactor(undefined)).toBe(1);
    expect(stipendFactor([])).toBe(1);
    expect(stipendFactor([{ factor: 1.5, daysLeft: 3 }])).toBe(1.5);
    expect(
      stipendFactor([
        { factor: 1.5, daysLeft: 3 },
        { factor: 0.5, daysLeft: 1 },
      ]),
    ).toBe(0.75);
  });
});

describe("tickStipendModifiers", () => {
  it("counts each window down and drops the exhausted ones", () => {
    expect(
      tickStipendModifiers([
        { factor: 1.5, daysLeft: 2 },
        { factor: 0.5, daysLeft: 1 },
      ]),
    ).toEqual([{ factor: 1.5, daysLeft: 1 }]);
  });

  it("returns undefined when nothing remains", () => {
    expect(tickStipendModifiers(undefined)).toBeUndefined();
    expect(tickStipendModifiers([{ factor: 2, daysLeft: 1 }])).toBeUndefined();
  });
});
