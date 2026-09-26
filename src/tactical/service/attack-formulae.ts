import type { CoverLevel } from "../../mapgen/model/cover";
import type { CombatTuning } from "../model/combat-tuning";
import type { DamageResistances } from "../model/damage-resistance";
import type { WeaponProfile } from "../model/weapon-profile";
import { pierceOf } from "../model/weapon-profile";

// ===========================================
// Types
// ===========================================

/** What the hit-chance formula reads off the map. */
export interface AttackTerrain {
  /** Tiles between attacker and target, in three dimensions (#1119). */
  readonly distance: number;
  readonly cover: CoverLevel;
  readonly flanked: boolean;
  readonly elevation: number;
}

// ===========================================
// Formulae
// ===========================================

/**
 * Whole-percent chance to hit (GDD §6.2): the weapon's accuracy less a
 * range penalty per tile beyond the first, less the target's cover
 * against this attacker, plus a flank bonus when the target has cover
 * elsewhere but not here, plus a capped elevation modifier; clamped into
 * the tuning's band.
 *
 * Here rather than in `combat-service` so the blast and the burn can
 * price damage without importing the resolver that calls them (#1121);
 * `combat-service` re-exports both formulae, so every earlier import
 * still resolves.
 */
export function hitChance(
  weapon: WeaponProfile,
  terrain: AttackTerrain,
  tuning: CombatTuning,
): number {
  const range = -tuning.rangePenaltyPerTile * Math.max(0, terrain.distance - 1);
  const cover = tuning.coverModifier[terrain.cover];
  const flank = terrain.flanked ? tuning.flankBonus : 0;
  const elevation = Math.max(
    -tuning.maxElevationModifier,
    Math.min(
      tuning.maxElevationModifier,
      terrain.elevation * tuning.elevationPerStorey,
    ),
  );
  const raw = weapon.accuracy + range + cover + flank + elevation;
  return Math.round(
    Math.max(tuning.minHitChance, Math.min(tuning.maxHitChance, raw)),
  );
}

/**
 * Inclusive band a hit can do after armor: the weapon's damage spread by
 * `damageSpread` either way, less the armor the weapon cannot penetrate,
 * never below `minDamage`; then less the target's resistance to the
 * weapon's tags (campaign arc §10.2), never below zero.
 *
 * ```
 *   band   = damage × (1 ± damageSpread)
 *   armour = max(minDamage, band − max(0, armor − armorPen − pierce))
 *   result = max(0, armour − resistanceTo(weapon, resist))
 * ```
 *
 * Armour-piercing rounds (`pierce`, campaign arc §10.2) are the mirror
 * of resistance: the attacker's, not the target's, and they come off
 * the armour **before** the floor, like the gun's own penetration, so
 * they can strip plate down to nothing but never below it, and a hit
 * still scratches at least `minDamage`. A weapon with no rounds loaded
 * gets exactly the band it always did.
 *
 * Resistance comes off after the floor on purpose: the floor says a hit
 * always scratches plain plate, and resistance is plate made for this
 * one kind of hit, so a spit it fully absorbs does nothing, the way an
 * ablative plate's absorption can take a hit to nothing
 * (`protectedDamage`). A weapon with no tag, or a target that resists
 * none of its tags, gets exactly the band it always did.
 *
 * @param weapon - The weapon landing the hit.
 * @param armor - The target's per-hit armor.
 * @param tuning - Spread and floor.
 * @param resist - The target's resistances; absent resists nothing.
 * @returns The inclusive `[low, high]` damage band.
 */
export function damageRange(
  weapon: WeaponProfile,
  armor: number,
  tuning: CombatTuning,
  resist?: DamageResistances,
): readonly [number, number] {
  if (weapon.damage <= 0) return [0, 0];
  const effectiveArmor = Math.max(
    0,
    armor - weapon.armorPen - pierceOf(weapon),
  );
  const low = Math.round(weapon.damage * (1 - tuning.damageSpread));
  const high = Math.round(weapon.damage * (1 + tuning.damageSpread));
  const resisted = resistanceTo(weapon, resist);
  return [
    Math.max(0, Math.max(tuning.minDamage, low - effectiveArmor) - resisted),
    Math.max(0, Math.max(tuning.minDamage, high - effectiveArmor) - resisted),
  ];
}

/**
 * Points a target with `resist` takes off each hit of `weapon`
 * (campaign arc §10.2): its best resistance among the weapon's tags,
 * so two tags a plate both resists are not counted twice. Zero for an
 * untagged weapon or a target that resists none of its tags.
 *
 * ```
 *   tags ["acid"], resist { acid: 3 }   ──► 3
 *   tags [],       resist { acid: 3 }   ──► 0
 *   tags ["acid"], resist undefined     ──► 0
 * ```
 *
 * @param weapon - The weapon, for its tags.
 * @param resist - The target's resistances; absent resists nothing.
 * @returns Non-negative whole points.
 */
export function resistanceTo(
  weapon: Pick<WeaponProfile, "tags">,
  resist: DamageResistances | undefined,
): number {
  if (resist === undefined) {
    return 0;
  }
  let best = 0;
  for (const tag of weapon.tags ?? []) {
    best = Math.max(best, resist[tag] ?? 0);
  }
  return best;
}
