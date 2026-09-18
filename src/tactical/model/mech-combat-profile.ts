import type { MechSystems } from "./mech-systems";
import type { UnitWeapon } from "./unit-weapon";

// ===========================================
// Mech combat profile
// ===========================================

/**
 * What a mech fights with on the field, derived from its stat sheet by
 * the tactical tuning (#1132): the one set of numbers the mech bay
 * prints and the unit factory freezes into a template, so the bay can
 * never say "50 armor" for a mech that takes hits at 15.
 *
 * ```
 *   MechStatSheet ──► mechCombatProfile(sheet, tuning) ──► MechCombatProfile
 *                                                            ├─► mech bay (Combat block)
 *                                                            └─► unit factory ──► UnitTemplate
 * ```
 *
 * Damage taken and the pilot's rank are the mission's business and are
 * folded in after this; the profile is the mech as built.
 */
export interface MechCombatProfile {
  readonly systems?: MechSystems;
  /** Hit points at full repair. Positive integer. */
  readonly maxHp: number;
  /** Action points per turn. Positive integer. */
  readonly maxAp: number;
  /** Tiles one move action covers. Positive integer. */
  readonly move: number;
  /** Damage absorbed per hit before hit points. Non-negative integer. */
  readonly armor: number;
  /** Tiles the mech sees, for fog of war. Positive integer. */
  readonly sightRange: number;
  /** Every attack the mech can make, in slot order, each with its field numbers. */
  readonly weapons: readonly UnitWeapon[];
}
