// ===========================================
// Weapon profile
// ===========================================

/**
 * How a unit attacks (GDD §6.2). Shared by squads, mechs and bugs so the
 * attack resolver has one shape to read; bug species (#322) carry one in
 * their data, roster units derive theirs at mission start (#321).
 */
export interface WeaponProfile {
  /** Tiles the weapon reaches, Manhattan. Positive integer; `1` is melee. */
  readonly range: number;
  /** Base hit chance in percent before cover and elevation. In `[0, 100]`. */
  readonly accuracy: number;
  /** Hit points removed by one hit before armor. Positive. */
  readonly damage: number;
  /** Armor points ignored by each hit. Non-negative. */
  readonly armorPen: number;
}

// ===========================================
// Melee
// ===========================================

/** Reach of a weapon that has to be in contact to be used. */
export const MELEE_RANGE = 1;

/**
 * True when the weapon has to be in contact to be used (#446).
 *
 * Cover is a ranged concept: it says a shooter's line is obstructed. A
 * claw at arm's length is not obstructed by the boulder the defender is
 * standing behind, and — worse — the flank rule would read that boulder
 * as an exposed angle and *raise* the attacker's chance, so a player who
 * took cover was punished for it. Cover protects against melee
 * structurally instead: a prop tile cannot be stood on, so it denies an
 * approach rather than granting a percentage (Director's ruling, #446).
 */
export function isMelee(weapon: WeaponProfile): boolean {
  return weapon.range <= MELEE_RANGE;
}
