import { describe, expect, it } from "vitest";

import { EVENT_TUNING } from "./event-tuning";

describe("event tuning", () => {
  it("offers events sometimes, never always", () => {
    expect(EVENT_TUNING.dailyEventChance).toBeGreaterThan(0);
    expect(EVENT_TUNING.dailyEventChance).toBeLessThan(1);
  });

  it("gives the player a whole positive number of days", () => {
    expect(Number.isInteger(EVENT_TUNING.expiryDays)).toBe(true);
    expect(EVENT_TUNING.expiryDays).toBeGreaterThan(0);
  });
});
