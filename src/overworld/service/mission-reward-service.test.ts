import { describe, expect, it } from "vitest";

import { AUTO_RESOLVE_TUNING } from "../data/auto-resolve-tuning";
import type { Mission } from "../model/mission";
import { MISSION_OUTCOMES } from "../model/mission-result";
import { creditsFor, infestationDeltaFor } from "./mission-reward-service";

const T = AUTO_RESOLVE_TUNING;

function mission(credits: number, difficulty = 4): Mission {
  return {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: "city-1",
    difficulty,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "medium",
      seed: "s",
    },
    rewards: { credits },
    createdDay: 1,
    expiresDay: 5,
    ignorePenalty: 3,
  };
}

describe("creditsFor", () => {
  it("pays in full for a win, a fraction for an extraction and nothing for a loss", () => {
    const m = mission(1000);
    expect(creditsFor("won", m, T)).toBe(1000);
    expect(creditsFor("extracted", m, T)).toBe(
      Math.floor(1000 * T.extractedRewardFraction),
    );
    expect(creditsFor("lost", m, T)).toBe(0);
  });

  it("always pays whole non-negative credits", () => {
    const m = mission(333);
    for (const outcome of MISSION_OUTCOMES) {
      const paid = creditsFor(outcome, m, T);
      expect(Number.isInteger(paid)).toBe(true);
      expect(paid).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("infestationDeltaFor", () => {
  it("clears more the harder the mission, punishes a loss and ignores an extraction", () => {
    expect(infestationDeltaFor("won", mission(0, 1), T)).toBe(
      -(T.clearanceBase + T.clearancePerDifficulty),
    );
    expect(infestationDeltaFor("won", mission(0, 10), T)).toBeLessThan(
      infestationDeltaFor("won", mission(0, 1), T),
    );
    expect(infestationDeltaFor("extracted", mission(0), T)).toBe(0);
    expect(infestationDeltaFor("lost", mission(0), T)).toBe(
      T.lossInfestationPenalty,
    );
  });
});
