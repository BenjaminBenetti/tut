import { describe, expect, it } from "vitest";

import { ACT_IDS } from "../../content/model/act-id";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import { HIVE_TUNING } from "./hive-tuning";

describe("hive tuning", () => {
  it("holds the campaign arc's values", () => {
    expect(HIVE_TUNING).toEqual({
      formationThreshold: 60,
      formationDays: 7,
      difficultyStepDays: 7,
      liberationCut: 20,
      liberationGrowthPauseDays: 10,
      formsFromAct: "act-2",
    });
  });

  it("forms from a reachable threshold after a whole number of days", () => {
    const { formationThreshold, formationDays } = HIVE_TUNING;
    expect(formationThreshold).toBeGreaterThan(MIN_INFESTATION);
    expect(formationThreshold).toBeLessThanOrEqual(MAX_INFESTATION);
    expect(Number.isInteger(formationDays)).toBe(true);
    expect(formationDays).toBeGreaterThan(0);
  });

  it("steps, cuts and pauses by whole amounts", () => {
    const { difficultyStepDays, liberationCut, liberationGrowthPauseDays } =
      HIVE_TUNING;
    expect(Number.isInteger(difficultyStepDays)).toBe(true);
    expect(difficultyStepDays).toBeGreaterThan(0);
    expect(Number.isInteger(liberationCut)).toBe(true);
    expect(liberationCut).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(liberationGrowthPauseDays)).toBe(true);
    expect(liberationGrowthPauseDays).toBeGreaterThanOrEqual(0);
  });

  it("names an act that exists and is not the first", () => {
    expect(ACT_IDS).toContain(HIVE_TUNING.formsFromAct);
    expect(ACT_IDS.indexOf(HIVE_TUNING.formsFromAct)).toBeGreaterThan(0);
  });
});
