import type { CoverLevel } from "../../mapgen/model/cover";
import type { CombatTuning } from "../model/combat-tuning";
import type { WeaponProfile } from "../model/weapon-profile";

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
 * never below `minDamage`.
 */
export function damageRange(
  weapon: WeaponProfile,
  armor: number,
  tuning: CombatTuning,
): readonly [number, number] {
  const effectiveArmor = Math.max(0, armor - weapon.armorPen);
  const low = Math.round(weapon.damage * (1 - tuning.damageSpread));
  const high = Math.round(weapon.damage * (1 + tuning.damageSpread));
  return [
    Math.max(tuning.minDamage, low - effectiveArmor),
    Math.max(tuning.minDamage, high - effectiveArmor),
  ];
}
