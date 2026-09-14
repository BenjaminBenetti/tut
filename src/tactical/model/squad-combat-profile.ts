import type { UnitWeapon } from "./unit-weapon";

// ===========================================
// Squad combat profile
// ===========================================

/**
 * What a squad of a type fights with on the field, derived from its
 * catalogue entry by the tactical tuning (#1132): the numbers the hire
 * and roster screens may print and the unit factory freezes into a
 * template, from one derivation so the two never disagree.
 *
 * ```
 *   SquadType ──► squadCombatProfile(type, tuning) ──► SquadCombatProfile
 *                                                        ├─► roster / hire screens
 *                                                        └─► unit factory ──► UnitTemplate
 * ```
 *
 * Casualties and the squad's rank are the mission's business and are
 * folded in after this; the profile is a full-strength, green squad.
 */
export interface SquadCombatProfile {
  /** Hit points of a squad at full strength. Positive integer. */
  readonly maxHp: number;
  /** Action points per turn. Positive integer. */
  readonly maxAp: number;
  /** Tiles one move action covers. Positive integer. */
  readonly move: number;
  /** Damage absorbed per hit before hit points. Non-negative integer. */
  readonly armor: number;
  /** Tiles the squad sees, for fog of war. Positive integer. */
  readonly sightRange: number;
  /** The one weapon the type carries, charges included. */
  readonly weapon: UnitWeapon;
}
