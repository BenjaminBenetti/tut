import type { ModelAssetId } from "../../content/data/model-ids";
import type { SquadTypeId } from "../../roster/model/squad-type";
import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Infantry
// ===========================================

/** How a squad's tactical stats derive from its roster entry and type. */
export interface InfantryUnitTuning {
  /** Hit points per soldier; a squad's `maxHp` is `maxStrength × hpPerSoldier`. Positive integer. */
  readonly hpPerSoldier: number;
  readonly maxAp: number;
  readonly move: number;
  readonly armor: number;
  /** Weapon shape; `damage` here is per point of the type's `combatRating`. */
  readonly weapon: WeaponProfile;
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
}
