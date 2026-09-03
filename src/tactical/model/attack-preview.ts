import type { CoverLevel } from "../../mapgen/model/cover";

// ===========================================
// Attack preview
// ===========================================

/**
 * What the HUD shows before the player commits to an attack (GDD §6.2:
 * hit chance and damage are visible before committing). Pure data from
 * `previewAttack`; `resolveAttack` rolls against exactly these numbers.
 */
export interface AttackPreview {
  /** Whole percent in `[minHitChance, maxHitChance]`. */
  readonly hitChance: number;
  /** Inclusive damage band after armor, `[min, max]`; whole numbers, `min >= minDamage`. */
  readonly damage: readonly [number, number];
  /** Tiles between attacker and target, Manhattan. */
  readonly distance: number;
  /** Cover the target has against this attacker. */
  readonly cover: CoverLevel;
  /** True when the target has cover on some side but none against this attacker. */
  readonly flanked: boolean;
  /** Levels the attacker stands above the target; negative below. */
  readonly elevation: number;
}
