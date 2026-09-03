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
