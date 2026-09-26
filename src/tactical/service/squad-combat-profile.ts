import type { InfantryUpgradeDefinition } from "../../roster/model/infantry-upgrade";
import { SQUAD_MAX_STRENGTH } from "../../roster/model/squad";
import { infantryArmorBonus } from "../../roster/service/infantry-upgrade-effect-service";
import type { SquadType } from "../../roster/model/squad-type";
import type { SquadCombatProfile } from "../model/squad-combat-profile";
import type { InfantryUnitTuning } from "../model/unit-tuning";
import type { UnitWeapon } from "../model/unit-weapon";
import { PRIMARY_WEAPON_ID } from "../model/unit-weapon";

// ===========================================
// Profile
// ===========================================

/**
 * The field numbers a squad type comes out as (#321, #1132): hit points
 * scale with soldiers (`maxStrength × hpPerSoldier`), actions, move and
 * sight are the infantry tuning's, armor is the tuning's plus what the
 * campaign's infantry upgrades add (campaign arc §10.3), and the weapon
 * is the type's own (`squadWeapon`).
 *
 * One derivation for the screens and the unit factory, so a hire panel
 * that says what a squad does and the squad that walks off the drop
 * ship agree. Pure: reads only its arguments.
 *
 * ```
 *   armor = infantry.armor + Σ upgrade.armorBonus
 *           0              + squad armour I (1) + squad armour II (1) = 2
 * ```
 *
 * @param squadType - The catalogue entry the squad is of.
 * @param infantry - The infantry slice of the unit tuning.
 * @param maxStrength - Soldiers in the squad at full strength.
 * @param upgrades - The campaign's infantry upgrades; none by default.
 * @returns The squad at full strength, green.
 */
export function squadCombatProfile(
  squadType: SquadType,
  infantry: InfantryUnitTuning,
  maxStrength: number = SQUAD_MAX_STRENGTH,
  upgrades: readonly InfantryUpgradeDefinition[] = [],
): SquadCombatProfile {
  return {
    maxHp: maxStrength * infantry.hpPerSoldier,
    maxAp: infantry.maxAp,
    move: infantry.move,
    armor: infantry.armor + infantryArmorBonus(upgrades),
    sightRange: infantry.sightRange,
    weapon: squadWeapon(squadType, infantry),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The one weapon a squad type fights with (#1121, #1130): the shared
 * shape under the type's own entry, named by that entry, with the
 * damage always the rating's — scaled by the entry, so an SMG hits a
 * little harder than a carbine — and the type's magazine.
 *
 * ```
 *   { ...weapon, ...entry }  less name and damageScale  ──► profile
 *   ⌈ combatRating × weapon.damage × damageScale ⌉, ≥ 1  ──► profile.damage
 * ```
 *
 * A type with no entry fires the plain shape under the fallback name,
 * so a squad type added to the catalogue without tuning is still armed.
 */
function squadWeapon(
  squadType: SquadType,
  infantry: InfantryUnitTuning,
): UnitWeapon {
  const {
    name = infantry.fallbackWeaponName,
    damageScale = 1,
    ...shape
  } = infantry.weaponByType[squadType.id] ?? {};
  return {
    id: PRIMARY_WEAPON_ID,
    name,
    profile: {
      ...infantry.weapon,
      ...shape,
      damage: Math.max(
        1,
        Math.ceil(
          squadType.combatRating * infantry.weapon.damage * damageScale,
        ),
      ),
    },
    charges: infantry.chargesByType[squadType.id] ?? infantry.fallbackCharges,
  };
}
