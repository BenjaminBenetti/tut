import { DAMAGE_TAGS } from "../../content/model/damage-tag";
import type { DamageResistances } from "../../tactical/model/damage-resistance";
import { formatWhole } from "./format";

// ===========================================
// Damage resistance text
// ===========================================

/**
 * What a mech or a part resists, in the player's words (campaign arc
 * §10.2), shared by the mech bay's Systems line and the tech tree's
 * "Unlocks" list so the two print a resistance the same way: one item
 * per resisted tag, in the fixed `DAMAGE_TAGS` order, the tag itself
 * naming the kind of hit. Tags resisted by zero or less are left out.
 *
 * ```
 *   { acid: 3 }             ──► ["acid resist 3"]
 *   { spine: 3, acid: 2 }   ──► ["acid resist 2", "spine resist 3"]
 *   undefined               ──► []
 * ```
 *
 * @param resist - The resistances; absent resists nothing.
 * @returns One item per resisted tag, without separators.
 */
export function damageResistanceText(
  resist: DamageResistances | undefined,
): readonly string[] {
  if (resist === undefined) {
    return [];
  }
  return DAMAGE_TAGS.flatMap((tag) => {
    const points = resist[tag] ?? 0;
    return points > 0 ? [`${tag} resist ${formatWhole(points)}`] : [];
  });
}
