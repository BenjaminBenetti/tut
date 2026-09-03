import { describe, expect, it } from "vitest";

import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import { MISSION_TUNING } from "./mission-tuning";

describe("mission tuning", () => {
  it("has a rule for every shipped mission type", () => {
    expect(Object.keys(MISSION_TUNING.rules).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
  });

  it("keeps thresholds, chances and weights in range", () => {
    for (const rule of Object.values(MISSION_TUNING.rules)) {
      expect(rule.minInfestation).toBeGreaterThanOrEqual(MIN_INFESTATION);
      expect(rule.minInfestation).toBeLessThanOrEqual(MAX_INFESTATION);
      expect(rule.chanceAtThreshold).toBeGreaterThanOrEqual(0);
      expect(rule.chanceAtMax).toBeLessThanOrEqual(1);
      expect(rule.chanceAtThreshold).toBeLessThanOrEqual(rule.chanceAtMax);
      expect(rule.infestationWeight).toBeGreaterThanOrEqual(0);
      expect(rule.threatWeight).toBeGreaterThanOrEqual(0);
      expect(rule.infestationWeight + rule.threatWeight).toBeCloseTo(1, 9);
    }
  });

  it("orders map size thresholds inside the difficulty range", () => {
    const { min, max } = MISSION_DIFFICULTY_RANGE;
    for (const rule of Object.values(MISSION_TUNING.rules)) {
      expect(Number.isInteger(rule.mediumFromDifficulty)).toBe(true);
      expect(Number.isInteger(rule.largeFromDifficulty)).toBe(true);
      expect(rule.mediumFromDifficulty).toBeGreaterThan(min);
      expect(rule.largeFromDifficulty).toBeGreaterThanOrEqual(
        rule.mediumFromDifficulty,
      );
      expect(rule.largeFromDifficulty).toBeLessThanOrEqual(max);
    }
  });
});
