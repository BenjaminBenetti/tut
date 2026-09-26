import { describe, expect, it } from "vitest";

import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ARMOUR_PIERCING_ROUNDS } from "../../roster/data/autopsy-parts";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import { isChassisPart } from "../../roster/model/mech-part";
import type {
  MechStatSheet,
  MechWeapon,
} from "../../roster/model/mech-stat-sheet";
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

  it("turns the starter's 20 plate into 6 per hit and 45 hit points, not into '20 armor'", () => {
    const sheet = sheetOf(STARTER_LOADOUT);
    expect(sheet.armor).toBe(20);
    const profile = mechCombatProfile(sheet, UNIT_TUNING.mech);
    expect(profile).toMatchObject({ maxHp: 45, armor: 6, move: 8, maxAp: 2 });
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

describe("mechCombatProfile with armour-piercing rounds (campaign arc §10.2)", () => {
  /** Every weapon part the game sells, as a sheet carries it. */
  const EVERY_WEAPON: readonly MechWeapon[] = STARTER_PARTS.flatMap(
    (part): MechWeapon[] =>
      isChassisPart(part) || part.weapon === undefined
        ? []
        : [
            {
              ...part.weapon,
              id: part.id,
              name: part.name,
              accuracy: part.stats.accuracy,
              firepower: part.stats.firepower,
            },
          ],
  );

  /** The starter sheet with every weapon fitted and `pierce` in its systems. */
  const armedWith = (pierce: number | undefined): MechStatSheet => {
    const sheet = sheetOf(STARTER_LOADOUT);
    const systems = sheet.systems;
    if (systems === undefined) throw new Error("the starter has systems");
    return {
      ...sheet,
      weapons: EVERY_WEAPON,
      systems: pierce === undefined ? systems : { ...systems, pierce },
    };
  };

  it("loads the rounds into the five guns that fire them, and into nothing else", () => {
    const profile = mechCombatProfile(armedWith(2), UNIT_TUNING.mech);
    const loaded = profile.weapons
      .filter((weapon) => weapon.profile.pierce !== undefined)
      .map((weapon) => weapon.name)
      .sort();
    expect(loaded).toEqual([
      "Autocannon",
      "Heavy Autocannon",
      "Railgun",
      "Rotary Cannon",
      "Siege Railgun",
    ]);
    for (const weapon of profile.weapons) {
      expect(weapon.profile.pierce ?? 2, weapon.name).toBe(2);
    }
  });

  it("changes no weapon at all on a mech without the rounds", () => {
    const bare = mechCombatProfile(armedWith(undefined), UNIT_TUNING.mech);
    expect(bare.weapons.every((w) => w.profile.pierce === undefined)).toBe(
      true,
    );
    // The rounds add their field and change nothing else about a gun.
    const loaded = mechCombatProfile(armedWith(2), UNIT_TUNING.mech);
    loaded.weapons.forEach((weapon, i) => {
      const { pierce: _pierce, ...rest } = weapon.profile;
      expect(rest, weapon.name).toEqual(bare.weapons[i]?.profile);
    });
  });

  it("reaches the unit's template from a real loadout fitting the rounds", () => {
    const loadout: MechLoadout = {
      ...STARTER_LOADOUT,
      utilityIds: [ARMOUR_PIERCING_ROUNDS],
    };
    const sheet = sheetOf(loadout);
    expect(sheet.systems?.pierce).toBe(2);
    const { template } = mechUnit(
      createMech(loadout, "mech-1", "Test"),
      sheet,
      { pos: { x: 0, y: 0, z: 0 }, facing: "n" },
      { ids: new SequentialIdGenerator(), tuning: UNIT_TUNING },
    );
    expect(
      template.weapons.map((w) => [w.name, w.profile.pierce ?? 0]),
    ).toEqual([
      ["Autocannon", 2],
      ["Missile Pod", 0],
    ]);
  });
});
