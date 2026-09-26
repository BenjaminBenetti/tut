import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import { offerChance } from "../service/missions/defend-installation-trigger";
import { MISSION_TUNING } from "./mission-tuning";

describe("mission tuning", () => {
  it("has a difficulty rule for every shipped mission type", () => {
    expect(Object.keys(MISSION_TUNING.difficulty).sort()).toEqual(
      [...MISSION_TYPE_IDS].sort(),
    );
  });

  it("keeps difficulty weights in range", () => {
    for (const rule of Object.values(MISSION_TUNING.difficulty)) {
      expect(rule.infestationWeight).toBeGreaterThanOrEqual(0);
      expect(rule.threatWeight).toBeGreaterThanOrEqual(0);
      expect(rule.infestationWeight + rule.threatWeight).toBeCloseTo(1, 9);
    }
  });

  it("rolls a defence from 5% at 40 region infestation up to one in four at 100 (#1175)", () => {
    // The Executive Director's numbers (2026-09-20): the baseline roll
    // at the threshold stays where it was, and climbs to about a
    // quarter chance a day at full infestation.
    const curve = MISSION_TUNING.defence.offer;
    expect(curve.minInfestation).toBeGreaterThanOrEqual(MIN_INFESTATION);
    expect(curve.minInfestation).toBeLessThanOrEqual(MAX_INFESTATION);
    expect(offerChance(39, curve)).toBe(0);
    expect(offerChance(40, curve)).toBeCloseTo(0.05);
    expect(offerChance(70, curve)).toBeCloseTo(0.15);
    expect(offerChance(100, curve)).toBeCloseTo(0.25);
  });

  it("offers a clearance from 20 infestation, from 10 in Act I, and mops up under 15 (arc §5, §6.1)", () => {
    const { minInfestationByAct, mopUpBelow } = MISSION_TUNING.clearance;
    expect(Object.keys(minInfestationByAct).sort()).toEqual(
      [...ACT_IDS].sort(),
    );
    expect(minInfestationByAct["act-1"]).toBe(10);
    expect(minInfestationByAct["act-2"]).toBe(20);
    expect(minInfestationByAct["act-3"]).toBe(20);
    expect(mopUpBelow).toBe(15);
  });

  it("orders map size thresholds inside the difficulty range", () => {
    const { min, max } = MISSION_DIFFICULTY_RANGE;
    for (const rule of Object.values(MISSION_TUNING.difficulty)) {
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
