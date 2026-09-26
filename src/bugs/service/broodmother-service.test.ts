import { describe, expect, it } from "vitest";

import { unitAt } from "../../tactical/service/tactical-fixtures.test-helper";
import { BROODMOTHER_TUNING } from "../data/broodmother-tuning";
import { BROODMOTHER } from "../data/species";
import {
  broodmotherEscaped,
  broodmotherHp,
  isBroodmother,
  isFleeing,
} from "./broodmother-service";
import { fieldMap, motherMission } from "./broodmother.test-helper";

describe("broodmotherHp (#1179, campaign arc §6.8)", () => {
  it("is a boss's 60 at difficulty 1 and climbs 2 a step to 78 at difficulty 10", () => {
    expect(broodmotherHp(1, 0)).toBe(60);
    expect(broodmotherHp(5, 0)).toBe(68);
    expect(broodmotherHp(10, 0)).toBe(78);
    for (let difficulty = 1; difficulty < 10; difficulty++) {
      expect(broodmotherHp(difficulty + 1, 0)).toBeGreaterThan(
        broodmotherHp(difficulty, 0),
      );
    }
  });

  it("adds a quarter of her unscarred hit points for every scar, one per earlier escape", () => {
    expect(broodmotherHp(5, 1)).toBe(85);
    expect(broodmotherHp(5, 2)).toBe(102);
    expect(broodmotherHp(1, 1)).toBe(75);
    expect(broodmotherHp(10, 1)).toBe(Math.round(78 * 1.25));
  });

  it("is the species' own hit points at difficulty 1 with no scars", () => {
    expect(BROODMOTHER.hp).toBe(broodmotherHp(1, 0));
  });

  it("reads nonsense inputs as the floor, never as less than her base", () => {
    expect(broodmotherHp(0, 0)).toBe(60);
    expect(broodmotherHp(1, -2)).toBe(60);
  });

  it("scales by whatever tuning it is given", () => {
    const tuning = {
      ...BROODMOTHER_TUNING,
      hpBase: 10,
      hpPerDifficulty: 1,
      scarHpBonus: 1,
    };
    expect(broodmotherHp(3, 1, tuning)).toBe(24);
  });
});

describe("isFleeing (#1179)", () => {
  it("flees at exactly half her max hit points, and not a point above", () => {
    expect(isFleeing({ hp: 30, maxHp: 60 })).toBe(true);
    expect(isFleeing({ hp: 31, maxHp: 60 })).toBe(false);
    expect(isFleeing({ hp: 1, maxHp: 60 })).toBe(true);
    // An odd maximum: half is 30.5, so 30 flees and 31 fights on.
    expect(isFleeing({ hp: 30, maxHp: 61 })).toBe(true);
    expect(isFleeing({ hp: 31, maxHp: 61 })).toBe(false);
  });

  it("keeps fleeing once marked, whatever her hit points", () => {
    expect(isFleeing({ hp: 60, maxHp: 60, fleeing: true })).toBe(true);
    expect(isFleeing({ hp: 60, maxHp: 60, fleeing: false })).toBe(false);
  });

  it("reads the threshold from the tuning", () => {
    const tuning = { ...BROODMOTHER_TUNING, fleeAtHpFraction: 0.25 };
    expect(isFleeing({ hp: 30, maxHp: 60 }, tuning)).toBe(false);
    expect(isFleeing({ hp: 15, maxHp: 60 }, tuning)).toBe(true);
  });
});

describe("isBroodmother and broodmotherEscaped (#1179)", () => {
  it("knows a Broodmother by her species on the bugs' side only", () => {
    expect(isBroodmother({ team: "bugs", sourceId: "broodmother" })).toBe(true);
    expect(isBroodmother({ team: "bugs", sourceId: "swarmer" })).toBe(false);
    expect(isBroodmother({ team: "tdf", sourceId: "broodmother" })).toBe(false);
  });

  it("reports an escape only once a Broodmother is in the escaped list", () => {
    const { mission, mother } = motherMission(
      fieldMap(12, 12).build(),
      [unitAt("squad", "infantry", { x: 0, y: 0, z: 0 })],
      { x: 5, y: 0, z: 5 },
    );
    expect(broodmotherEscaped(mission)).toBe(false);
    expect(broodmotherEscaped({ ...mission, escaped: [] })).toBe(false);
    const swarmer = unitAt("swarmer", "infantry", mother.pos, {
      team: "bugs",
    });
    expect(broodmotherEscaped({ ...mission, escaped: [swarmer] })).toBe(false);
    expect(broodmotherEscaped({ ...mission, escaped: [mother] })).toBe(true);
  });
});
