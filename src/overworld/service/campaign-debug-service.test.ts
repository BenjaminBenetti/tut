import { describe, expect, it } from "vitest";

import { THREAT_TUNING } from "../data/threat-tuning";
import { applyDebugThreat } from "./campaign-debug-service";

describe("applyDebugThreat", () => {
  it("returns the shipped tuning by identity with no debug options or a multiplier of 1", () => {
    expect(applyDebugThreat(THREAT_TUNING, undefined)).toBe(THREAT_TUNING);
    expect(applyDebugThreat(THREAT_TUNING, {})).toBe(THREAT_TUNING);
    expect(
      applyDebugThreat(THREAT_TUNING, { threatEscalationMultiplier: 1 }),
    ).toBe(THREAT_TUNING);
  });

  it("scales the daily escalation and its cap, leaving the infestation weight alone", () => {
    const fast = applyDebugThreat(THREAT_TUNING, {
      threatEscalationMultiplier: 100,
    });
    expect(fast).toEqual({
      infestationWeight: THREAT_TUNING.infestationWeight,
      escalationPerDay: THREAT_TUNING.escalationPerDay * 100,
      escalationCap: THREAT_TUNING.escalationCap * 100,
    });
    expect(THREAT_TUNING.escalationPerDay).toBe(0.1);
  });

  it("rejects a non-positive or non-finite multiplier", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        applyDebugThreat(THREAT_TUNING, { threatEscalationMultiplier: bad }),
      ).toThrow(RangeError);
    }
  });
});
