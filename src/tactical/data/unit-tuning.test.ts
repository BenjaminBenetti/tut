import { describe, expect, it } from "vitest";

import { MODEL_IDS } from "../../content/data/model-ids";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UNIT_TUNING } from "./unit-tuning";

describe("unit tuning", () => {
  it("uses positive whole hit points, action points and moves", () => {
    const { infantry, mech } = UNIT_TUNING;
    for (const value of [
      infantry.hpPerSoldier,
      infantry.maxAp,
      infantry.move,
      mech.baseHp,
      mech.maxAp,
      mech.baseMove,
      mech.minMove,
      mech.maxMove,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(mech.minMove).toBeLessThanOrEqual(mech.maxMove);
    expect(mech.hpPerArmor).toBeGreaterThanOrEqual(0);
    expect(mech.armorFactor).toBeGreaterThanOrEqual(0);
    expect(mech.armorFactor).toBeLessThanOrEqual(1);
  });

  it("keeps weapon shapes in range", () => {
    for (const weapon of [
      UNIT_TUNING.infantry.weapon,
      UNIT_TUNING.mech.weapon,
    ]) {
      expect(weapon.range).toBeGreaterThan(0);
      expect(weapon.accuracy).toBeGreaterThanOrEqual(0);
      expect(weapon.accuracy).toBeLessThanOrEqual(100);
      expect(weapon.damage).toBeGreaterThan(0);
      expect(weapon.armorPen).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives every shipped squad type and the mech a positive whole charge pool", () => {
    for (const type of SQUAD_TYPES) {
      const charges = UNIT_TUNING.infantry.chargesByType[type.id];
      expect(charges, type.id).toBeDefined();
      expect(Number.isInteger(charges)).toBe(true);
      expect(charges).toBeGreaterThan(0);
    }
    expect(UNIT_TUNING.infantry.fallbackCharges).toBeGreaterThan(0);
    expect(Number.isInteger(UNIT_TUNING.mech.charges)).toBe(true);
    expect(UNIT_TUNING.mech.charges).toBeGreaterThan(0);
  });

  it("maps every shipped squad type to a known model", () => {
    for (const type of SQUAD_TYPES) {
      const modelId = UNIT_TUNING.infantry.modelIdByType[type.id];
      expect(modelId, type.id).toBeDefined();
      expect(MODEL_IDS).toContain(modelId);
    }
    expect(MODEL_IDS).toContain(UNIT_TUNING.infantry.fallbackModelId);
    expect(MODEL_IDS).toContain(UNIT_TUNING.mech.modelId);
  });

  it("gives every class eyes at least as long as its weapon (ADR 0006)", () => {
    // Overwatch may only react to a mover the watcher can see. That holds
    // structurally in `overwatchReaction`, but it also has to hold in the
    // numbers, or a unit would be refused shots it is entitled to take.
    for (const klass of [UNIT_TUNING.infantry, UNIT_TUNING.mech]) {
      expect(klass.sightRange).toBeGreaterThanOrEqual(klass.weapon.range);
    }
  });
});
