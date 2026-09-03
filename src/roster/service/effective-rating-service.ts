import type { Mech } from "../model/mech";
import { MECH_MAX_DAMAGE } from "../model/mech";
import type { MechStatSheet } from "../model/mech-stat-sheet";

// ===========================================
// Public Functions
// ===========================================

/**
 * A mech's combat rating as it stands, its built rating reduced by
 * accumulated damage. This is the same penalty the M1 auto-resolver
 * applies (`overworld/service/force-rating-service.ts`), exposed so the
 * roster screen shows the number the resolver will use.
 *
 * ```
 *   effective = combatRating × max( 0, 1 − damage / MECH_MAX_DAMAGE × damagePenalty )
 * ```
 *
 * `damagePenalty` is the resolver's tuning knob in `[0, 1]`: at `1` a
 * mech at maximum damage counts for nothing, at `0` damage is ignored.
 */
export function effectiveCombatRating(
  mech: Mech,
  sheet: Pick<MechStatSheet, "combatRating">,
  damagePenalty: number,
): number {
  const damageFraction = mech.damage / MECH_MAX_DAMAGE;
  const factor = Math.max(0, 1 - damageFraction * damagePenalty);
  return sheet.combatRating * factor;
}
