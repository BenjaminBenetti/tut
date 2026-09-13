import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { createMech } from "../../roster/service/mech-factory";
import { UNIT_TUNING } from "../data/unit-tuning";
import { mechCombatProfile } from "./mech-combat-profile";
import { mechUnit } from "./unit-factory";

// ===========================================
// Fixtures
// ===========================================

/** The heaviest frame with the heaviest legs and both heavy guns. */
const HEAVY: MechLoadout = {
  name: "Anvil",
  chassisId: "chassis-bulwark",
  legsId: "legs-bastion",
  armsId: "arms-manipulator",
  armWeaponId: "arm-weapon-railgun",
  backWeaponId: "back-weapon-mortar",
  utilityIds: [],
};

/** The validated sheet of a loadout, or a thrown reason. */
function sheetOf(loadout: MechLoadout): MechStatSheet {
  const result = validateLoadout(
    loadout,
    new StaticPartCatalogue(STARTER_PARTS),
    MECH_RATING_TUNING,
    UPGRADE_TUNING,
  );
  if (!result.ok) {
    throw new Error(
      `loadout should validate: ${result.error.map((e) => e.code).join(", ")}`,
    );
  }
  return result.value;
}

// ===========================================
// Tests
// ===========================================

describe("mechCombatProfile (#1132)", () => {
  it("is exactly what the unit factory freezes into a green, undamaged mech's template", () => {
    for (const loadout of [STARTER_LOADOUT, HEAVY]) {
      const sheet = sheetOf(loadout);
      const profile = mechCombatProfile(sheet, UNIT_TUNING.mech);
      const { template } = mechUnit(
        createMech(loadout, "mech-1", "Test"),
        sheet,
        { pos: { x: 0, y: 0, z: 0 }, facing: "n" },
        { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING },
      );
      expect(template.maxHp).toBe(profile.maxHp);
      expect(template.maxAp).toBe(profile.maxAp);
      expect(template.move).toBe(profile.move);
      expect(template.armor).toBe(profile.armor);
      expect(template.sightRange).toBe(profile.sightRange);
      expect(template.weapons).toEqual(profile.weapons);
    }
  });

  it("turns the starter's 20 plate into 6 per hit and 70 hit points, not into '20 armor'", () => {
    const sheet = sheetOf(STARTER_LOADOUT);
    expect(sheet.armor).toBe(20);
    const profile = mechCombatProfile(sheet, UNIT_TUNING.mech);
    expect(profile).toMatchObject({ maxHp: 70, armor: 6, move: 8, maxAp: 2 });
    expect(profile.weapons.map((w) => w.name)).toEqual([
      "Autocannon",
      "Missile Pod",
    ]);
  });

  it("gives a mech with nothing fitted the tuning's fallback weapon", () => {
    const sheet: MechStatSheet = {
      ...sheetOf(STARTER_LOADOUT),
      weapons: [],
    };
    const profile = mechCombatProfile(sheet, UNIT_TUNING.mech);
    expect(profile.weapons).toHaveLength(1);
    expect(profile.weapons[0]?.profile).toEqual(UNIT_TUNING.mech.weapon);
  });
});
