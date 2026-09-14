import type { ModelAssetId } from "../../content/data/model-ids";
import type { RankTuning } from "../../roster/model/rank";
import type { SquadTypeId } from "../../roster/model/squad-type";
import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Infantry
// ===========================================

/**
 * How one squad type's weapon differs from the shared shape (#1121,
 * #1130): what it is called, how much harder or softer it hits than
 * its rating alone says, and any profile field of its own — range,
 * accuracy, blast, force, and whether a shot ends the turn. `damage`
 * is never set here: it stays the rating's, scaled.
 *
 * ```
 *   profile = { ...weapon, ...entry (less name, damageScale) }
 *   damage  = ⌈ combatRating × weapon.damage × damageScale ⌉, at least 1
 * ```
 */
export interface SquadWeaponTuning extends Omit<
  Partial<WeaponProfile>,
  "damage"
> {
  /** What the unit card calls the weapon: "Carbine", "SMG". */
  readonly name?: string;
  /** Multiplier on the rating-derived damage before the ceiling; `1` when absent. Positive. */
  readonly damageScale?: number;
}

/** How a squad's tactical stats derive from its roster entry and type. */
export interface InfantryUnitTuning {
  /** Hit points per soldier; a squad's `maxHp` is `maxStrength × hpPerSoldier`. Positive integer. */
  readonly hpPerSoldier: number;
  readonly maxAp: number;
  readonly move: number;
  readonly armor: number;
  /** Weapon shape; `damage` here is per point of the type's `combatRating`. */
  readonly weapon: WeaponProfile;
  /**
   * How each squad type's weapon differs from the shape above (#1121,
   * #1130): its name, its damage scale, a rocket squad's blast and force,
   * an SMG's short range and one shot a turn. Merged over `weapon`;
   * `damage` stays the rating's, scaled. Types missing here fire the
   * plain shape under `fallbackWeaponName`.
   */
  readonly weaponByType: Readonly<
    Partial<Record<SquadTypeId, SquadWeaponTuning>>
  >;
  /** What a squad type with no entry in `weaponByType` calls its weapon. */
  readonly fallbackWeaponName: string;
  /** Tiles a unit of this class sees (ADR 0006); longer than its weapon range. */
  readonly sightRange: number;
  /** Model per squad type; types missing here draw `fallbackModelId`. */
  readonly modelIdByType: Readonly<Record<SquadTypeId, ModelAssetId>>;
  readonly fallbackModelId: ModelAssetId;
  /** Shots per magazine per squad type (#409); types missing here get `fallbackCharges`. Positive integers. */
  readonly chargesByType: Readonly<Record<SquadTypeId, number>>;
  readonly fallbackCharges: number;
}

// ===========================================
// Mech
// ===========================================

/** How a mech's tactical stats derive from its stat sheet (#49). */
export interface MechUnitTuning {
  /** Hit points before armor is counted. Positive integer. */
  readonly baseHp: number;
  /** Extra hit points per point of sheet `armor`. Non-negative. */
  readonly hpPerArmor: number;
  /** Fraction of sheet `armor` that becomes per-hit armor. In `[0, 1]`. */
  readonly armorFactor: number;
  readonly maxAp: number;
  /** Tiles per move action when the sheet's `mobility` is zero; mobility adds one for one. Positive. */
  readonly baseMove: number;
  /** Lower and upper bounds on the derived move. */
  readonly minMove: number;
  readonly maxMove: number;
  /** Weapon shape; `damage` scales sheet `firepower`, `accuracy` is the base the sheet's modifier adds to. */
  readonly weapon: WeaponProfile;
  /** Tiles a unit of this class sees (ADR 0006); longer than its weapon range. */
  readonly sightRange: number;
  readonly modelId: ModelAssetId;
  /** Shots a mech fires before it must vent heat (#409). Positive integer. */
  readonly charges: number;
}

// ===========================================
// Bundle
// ===========================================

/**
 * Balance knobs for turning roster entries into tactical units (#321).
 * Bugs need none: their species data is already in tactical terms.
 * Defaults live in `tactical/data/unit-tuning.ts`.
 */
export interface UnitTuning {
  readonly infantry: InfantryUnitTuning;
  readonly mech: MechUnitTuning;
  /**
   * The roster's rank ladder and what each rung adds to a squad's or a
   * mech's template at mission start (#1130). The same object the
   * roster promotes with, so the rank the HUD names is the one the
   * bonuses were paid for.
   */
  readonly ranks: RankTuning;
}
