import { describe, expect, it } from "vitest";

import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { RIFLE_SQUAD } from "../../roster/data/squad-types";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { MISSION_OUTCOMES } from "../model/mission-result";
import { winProbability } from "../service/auto-resolve-mission-resolver";
import { AUTO_RESOLVE_TUNING } from "./auto-resolve-tuning";

const T = AUTO_RESOLVE_TUNING;

describe("auto-resolve tuning", () => {
  it("has positive scale and spread", () => {
    expect(T.difficultyScale).toBeGreaterThan(0);
    expect(T.winSpread).toBeGreaterThan(0);
  });

  it("keeps every probability and fraction in [0, 1]", () => {
    const values = [
      T.damagePenalty,
      T.extractChance,
      T.extractedRewardFraction,
      ...MISSION_OUTCOMES.map((o) => T.casualtyChance[o]),
      ...MISSION_OUTCOMES.map((o) => T.mechDestructionChance[o]),
    ];
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("punishes a loss more than an extraction more than a win", () => {
    expect(T.casualtyChance.won).toBeLessThan(T.casualtyChance.extracted);
    expect(T.casualtyChance.extracted).toBeLessThan(T.casualtyChance.lost);
    expect(T.mechDestructionChance.won).toBeLessThan(
      T.mechDestructionChance.extracted,
    );
    expect(T.mechDestructionChance.extracted).toBeLessThan(
      T.mechDestructionChance.lost,
    );
    expect(T.mechDamage.won.max).toBeLessThanOrEqual(
      T.mechDamage.extracted.max,
    );
    expect(T.mechDamage.extracted.max).toBeLessThanOrEqual(
      T.mechDamage.lost.max,
    );
  });

  it("uses whole, ordered damage ranges inside the mech damage scale", () => {
    for (const outcome of MISSION_OUTCOMES) {
      const { min, max } = T.mechDamage[outcome];
      expect(Number.isInteger(min), outcome).toBe(true);
      expect(Number.isInteger(max), outcome).toBe(true);
      expect(min, outcome).toBeGreaterThanOrEqual(0);
      expect(min, outcome).toBeLessThanOrEqual(max);
      expect(max, outcome).toBeLessThanOrEqual(MECH_MAX_DAMAGE);
    }
  });

  it("clears infestation on a win and adds some on a loss", () => {
    expect(Number.isInteger(T.clearanceBase)).toBe(true);
    expect(Number.isInteger(T.clearancePerDifficulty)).toBe(true);
    expect(Number.isInteger(T.lossInfestationPenalty)).toBe(true);
    expect(T.clearanceBase + T.clearancePerDifficulty).toBeGreaterThan(0);
    expect(T.lossInfestationPenalty).toBeGreaterThan(0);
  });

  // ===========================================
  // Design targets (#336)
  // ===========================================

  it("makes one point of difficulty worth exactly a full rifle squad", () => {
    expect(T.difficultyScale).toBe(RIFLE_SQUAD.combatRating);
  });

  it("gives a lone full rifle squad an even fight at difficulty 1 and two squads at difficulty 2", () => {
    const squad = RIFLE_SQUAD.combatRating;
    expect(winProbability(squad, 1, T)).toBeCloseTo(0.5, 5);
    expect(winProbability(2 * squad, 2, T)).toBeCloseTo(0.5, 5);
  });

  it("keeps the starter roster at or above even odds on a difficulty 5 mission and warns a lone squad off difficulty 3", () => {
    const sheet = validateLoadout(
      STARTER_LOADOUT,
      new StaticPartCatalogue(STARTER_PARTS),
      MECH_RATING_TUNING,
      UPGRADE_TUNING,
    );
    if (!sheet.ok) throw new Error("starter loadout must validate");
    const starterForce =
      2 * RIFLE_SQUAD.combatRating + sheet.value.combatRating;
    expect(winProbability(starterForce, 5, T)).toBeGreaterThanOrEqual(0.5);
    expect(winProbability(starterForce, 3, T)).toBeGreaterThan(0.85);
    expect(winProbability(RIFLE_SQUAD.combatRating, 3, T)).toBeLessThan(0.2);
    // The starter mech is worth a bit over three squads, not a dozen.
    const mechInSquads = sheet.value.combatRating / RIFLE_SQUAD.combatRating;
    expect(mechInSquads).toBeGreaterThan(2.5);
    expect(mechInSquads).toBeLessThan(4.5);
  });
});
