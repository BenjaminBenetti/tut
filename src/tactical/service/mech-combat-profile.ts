import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { MechCombatProfile } from "../model/mech-combat-profile";
import type { MechUnitTuning } from "../model/unit-tuning";
import type { UnitWeapon } from "../model/unit-weapon";
import { DEFAULT_WEAPON_NAME, PRIMARY_WEAPON_ID } from "../model/unit-weapon";

// ===========================================
// Profile
// ===========================================

/**
 * The field numbers a validated stat sheet comes out as (#49, #1132):
 * `maxHp = chassis hullHp + armor × hpPerArmor` (legacy sheets use baseHp); move is `baseMove + mobility`
 * clamped to the tuning's bounds; per-hit armor is `armor × armorFactor`;
 * each fitted weapon fires for its own firepower scaled by the tuning's
 * damage, at the base accuracy plus the sheet's modifier less the other
 * weapons' contributions, clamped to a percentage.
 *
 * One derivation for the mech bay and the unit factory: the bay prints
 * this, the factory freezes it into the template, and a rule that reads
 * either is reading the same mech. Pure: reads only its arguments.
 *
 * @param sheet - The validated stat sheet of a loadout.
 * @param tuning - The mech slice of the unit tuning.
 * @returns The mech as built, before damage and rank.
 */
export function mechCombatProfile(
  sheet: MechStatSheet,
  tuning: MechUnitTuning,
): MechCombatProfile {
  return {
    ...(sheet.systems === undefined ? {} : { systems: sheet.systems }),
    maxHp: Math.max(
      1,
      Math.round(
        (sheet.hullHp ?? tuning.baseHp) + sheet.armor * tuning.hpPerArmor,
      ),
    ),
    maxAp: tuning.maxAp,
    move: clamp(
      Math.round(tuning.baseMove + sheet.mobility),
      tuning.minMove,
      tuning.maxMove,
    ),
    armor: Math.max(0, Math.round(sheet.armor * tuning.armorFactor)),
    sightRange: tuning.sightRange + (sheet.systems?.sightBonus ?? 0),
    weapons: mechWeapons(sheet, tuning),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Every weapon a mech's sheet fitted, as tactical attacks (#532). Each
 * gets its own range and penetration from the part, its own damage from
 * that part's firepower, and the mech's base accuracy adjusted by that
 * part's own modifier — so an accurate laser and a wild mortar differ,
 * where before every weapon fired at the sheet's average.
 *
 * A mech with no weapon fitted falls back to the tuning's profile, so a
 * bare chassis is still a unit rather than a crash. That is a loadout
 * the validator already refuses; this is belt and braces.
 */
function mechWeapons(
  sheet: MechStatSheet,
  tuning: MechUnitTuning,
): readonly UnitWeapon[] {
  if (sheet.weapons.length === 0) {
    return [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: { ...tuning.weapon },
        charges: tuning.charges,
      },
    ];
  }
  // Every accuracy contribution except the *other* weapons'. The sheet
  // total includes arms, legs and utility parts — a targeting computer
  // has to keep working — but a mortar must not make the laser beside it
  // wilder, so each weapon adds its own and drops its neighbours'.
  const weaponAccuracy = sheet.weapons.reduce(
    (sum, weapon) => sum + weapon.accuracy,
    0,
  );
  return sheet.weapons.map((weapon) => ({
    id: weapon.id,
    name: weapon.name,
    profile: {
      ...(weapon.heat === undefined
        ? {}
        : {
            heat: Math.ceil(
              weapon.heat *
                (weapon.energy ? (sheet.systems?.energyHeatFactor ?? 1) : 1),
            ),
          }),
      ...(weapon.energy ? { energy: true } : {}),
      ...(weapon.indirect ? { indirect: true } : {}),
      ...(weapon.minRange === undefined ? {} : { minRange: weapon.minRange }),
      ...(weapon.requiresBrace ? { requiresBrace: true } : {}),
      ...(weapon.guided ? { guided: true } : {}),
      ...(weapon.beam ? { beam: true } : {}),
      ...(weapon.cooldown === undefined ? {} : { cooldown: weapon.cooldown }),
      range: weapon.range,
      accuracy: clamp(
        Math.round(
          tuning.weapon.accuracy +
            sheet.accuracy -
            (weaponAccuracy - weapon.accuracy),
        ),
        0,
        100,
      ),
      damage: Math.max(0, Math.round(weapon.firepower * tuning.weapon.damage)),
      armorPen: weapon.armorPen,
      // How the part lands is the part's own (#1121), carried through
      // as declared: a mortar's blast is not a tuning knob.
      ...(weapon.aoe === undefined ? {} : { aoe: weapon.aoe }),
      ...(weapon.aoeEffect === undefined
        ? {}
        : { aoeEffect: weapon.aoeEffect }),
      ...(weapon.demoForce === undefined
        ? {}
        : { demoForce: weapon.demoForce }),
    },
    ...(sheet.systems === undefined ? { charges: tuning.charges } : {}),
  }));
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
