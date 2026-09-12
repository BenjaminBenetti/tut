// ===========================================
// Weapon reach tuning
// ===========================================

/**
 * Knobs for how height changes a weapon's reach (GDD §6.2, #1119). Part
 * of `CombatTuning`; the reach rules take only this slice.
 *
 * ```
 *   reach = range + min(maxReachBonus, storeysAbove × reachBonusPerStorey)
 *           storeysAbove = whole storeys the attacker stands above the
 *           target, never below zero; a melee weapon gets no bonus
 * ```
 */
export interface WeaponReachTuning {
  /** Tiles of reach gained per whole storey the attacker stands above the target. Non-negative. */
  readonly reachBonusPerStorey: number;
  /** Most reach height can add. Non-negative. */
  readonly maxReachBonus: number;
}
