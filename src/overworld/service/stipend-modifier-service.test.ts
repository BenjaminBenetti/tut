import { describe, expect, it } from "vitest";

import {
  queueStipendModifier,
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

  it("keeps each window's source as it counts down", () => {
    expect(
      tickStipendModifiers([
        { factor: 1.5, daysLeft: 2, source: "evacuation-saved" },
        { factor: 0.5, daysLeft: 3 },
      ]),
    ).toEqual([
      { factor: 1.5, daysLeft: 1, source: "evacuation-saved" },
      { factor: 0.5, daysLeft: 2 },
    ]);
  });

  it("returns undefined when nothing remains", () => {
    expect(tickStipendModifiers(undefined)).toBeUndefined();
    expect(tickStipendModifiers([{ factor: 2, daysLeft: 1 }])).toBeUndefined();
  });
});

describe("queueStipendModifier", () => {
  it("refreshes a window of the same source instead of stacking it", () => {
    const queued = queueStipendModifier(
      [
        { factor: 1.5, daysLeft: 3, source: "evacuation-saved" },
        { factor: 0.5, daysLeft: 2 },
      ],
      { factor: 1.5, daysLeft: 10, source: "evacuation-saved" },
    );
    expect(queued).toEqual([
      { factor: 0.5, daysLeft: 2 },
      { factor: 1.5, daysLeft: 10, source: "evacuation-saved" },
    ]);
    expect(stipendFactor(queued)).toBe(0.75);
  });

  it("stacks windows of other sources, and ones with none", () => {
    const saved = { factor: 1.5, daysLeft: 4, source: "evacuation-saved" };
    const lost = { factor: 0.9, daysLeft: 10, source: "evacuation-lost" };
    expect(queueStipendModifier([saved], lost)).toEqual([saved, lost]);
    const event = { factor: 0.5, daysLeft: 2 };
    expect(queueStipendModifier([event], event)).toEqual([event, event]);
    expect(queueStipendModifier(undefined, lost)).toEqual([lost]);
  });

  it("leaves the list it was given alone", () => {
    const before = [{ factor: 1.5, daysLeft: 3, source: "evacuation-saved" }];
    const copy = structuredClone(before);
    queueStipendModifier(before, {
      factor: 1.5,
      daysLeft: 10,
      source: "evacuation-saved",
    });
    expect(before).toEqual(copy);
  });
});
