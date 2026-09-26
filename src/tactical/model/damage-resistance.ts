import type { DamageTag } from "../../content/model/damage-tag";

// ===========================================
// Damage resistance
// ===========================================

/**
 * Hit points taken off every hit of a tagged kind (campaign arc §10.2),
 * keyed by the damage tag: `{ acid: 3 }` means an acid hit does three
 * less. A missing tag resists nothing. Values are non-negative whole
 * points.
 *
 * Resistance is plate that only one kind of hit meets, so it works like
 * armour against that kind with two differences: the weapon's
 * penetration does not bite on it, and it comes off **after** the
 * minimum-damage floor, so a hit it fully absorbs does nothing at all,
 * the way ablative armour's absorption can (`attack-formulae`,
 * `damageRange`).
 *
 * ```
 *   part.traits.resist ──► mechSystemsOf (best per tag) ──► sheet.systems.resist
 *     ──► mechCombatProfile.resist ──► UnitTemplate.resist ──► AttackTarget.resist
 *     ──► damageRange(weapon, armor, tuning, resist)   every hit whose weapon has the tag
 * ```
 */
export type DamageResistances = Readonly<Partial<Record<DamageTag, number>>>;
