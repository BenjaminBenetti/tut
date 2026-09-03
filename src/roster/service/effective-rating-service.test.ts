import { describe, expect, it } from "vitest";

import type { Mech } from "../model/mech";
import { effectiveCombatRating } from "./effective-rating-service";

/** A mech with the given damage. */
function mech(damage: number): Mech {
  return {
    id: "m",
    name: "M",
    loadout: {
      name: "L",
      chassisId: "c",
      legsId: "l",
      armsId: "a",
      armWeaponId: "aw",
      backWeaponId: "bw",
      utilityIds: [],
    },
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

const SHEET = { combatRating: 200 };

describe("effectiveCombatRating", () => {
  it("returns the built rating for an undamaged mech", () => {
    expect(effectiveCombatRating(mech(0), SHEET, 1)).toBe(200);
  });

  it("scales the rating down linearly with damage at full penalty", () => {
    expect(effectiveCombatRating(mech(25), SHEET, 1)).toBe(150);
    expect(effectiveCombatRating(mech(100), SHEET, 1)).toBe(0);
  });

  it("honours the penalty knob and never goes negative", () => {
    expect(effectiveCombatRating(mech(50), SHEET, 0)).toBe(200);
    expect(effectiveCombatRating(mech(50), SHEET, 0.5)).toBe(150);
    expect(effectiveCombatRating(mech(100), SHEET, 2)).toBe(0);
  });
});
