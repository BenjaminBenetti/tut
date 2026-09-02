import { describe, expect, it } from "vitest";

import type { EventEffect } from "./event-type";
import {
  CITY_SCOPED_EFFECT_KINDS,
  EVENT_EFFECT_KINDS,
  EVENT_TYPE_IDS,
  isCityScopedEffect,
  isEventTypeId,
} from "./event-type";

describe("EventTypeId", () => {
  it("lists each id once", () => {
    expect(new Set(EVENT_TYPE_IDS).size).toBe(EVENT_TYPE_IDS.length);
  });

  it("narrows known ids and rejects unknown strings", () => {
    for (const id of EVENT_TYPE_IDS) {
      expect(isEventTypeId(id)).toBe(true);
    }
    expect(isEventTypeId("")).toBe(false);
    expect(isEventTypeId("meteor-strike")).toBe(false);
    expect(isEventTypeId("Funding-Review")).toBe(false);
  });
});

describe("EventEffect kinds", () => {
  it("lists each kind once", () => {
    expect(new Set(EVENT_EFFECT_KINDS).size).toBe(EVENT_EFFECT_KINDS.length);
  });

  it("keeps the city-scoped kinds a subset of all kinds", () => {
    for (const kind of CITY_SCOPED_EFFECT_KINDS) {
      expect(EVENT_EFFECT_KINDS).toContain(kind);
    }
  });

  it("recognises only city-scoped effects", () => {
    const samples: readonly EventEffect[] = [
      { kind: "credits", amount: 100 },
      { kind: "cityInfestation", delta: -5 },
      { kind: "threat", delta: 2 },
      { kind: "stipendMultiplier", factor: 1.5, days: 3 },
    ];
    const scoped = samples.filter(isCityScopedEffect).map((e) => e.kind);
    expect(scoped).toEqual(["cityInfestation"]);
  });
});
