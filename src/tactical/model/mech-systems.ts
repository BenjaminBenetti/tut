/** Capabilities supplied by fitted parts. Missing values preserve older templates. */
export interface MechTraits {
  readonly heatCapacity?: number;
  readonly sightBonus?: number;
  readonly jumpRange?: number;
  readonly jumpHeight?: number;
  readonly jumpHeat?: number;
  readonly allTerrain?: boolean;
  readonly braceAccuracy?: number;
  readonly stationaryAccuracy?: number;
  /** Fraction of energy weapon heat retained, normally one. */
  readonly energyHeatFactor?: number;
  readonly ablativeHits?: number;
  readonly ablativeAbsorption?: number;
  /** Full heat clears available per mission. */
  readonly coolantUses?: number;
  /** Accuracy added to allied guided fire at this unit's designated target. */
  readonly designationAccuracy?: number;
  readonly equipment?: readonly string[];
}

/** Frozen thermal and fitting capabilities of a newly assembled mech. */
export interface MechSystems extends MechTraits {
  readonly heatCapacity: number;
  readonly cooling: number;
  readonly idleHeat: number;
  readonly movementHeat: number;
}

/** Optional weapon behaviours shared by parts, previews and tactical profiles. */
export interface WeaponMechanics {
  readonly heat?: number;
  readonly energy?: boolean;
  readonly indirect?: boolean;
  readonly minRange?: number;
  readonly requiresBrace?: boolean;
  readonly guided?: boolean;
  readonly beam?: boolean;
  /** Friendly turns between volleys; zero permits firing next turn. */
  readonly cooldown?: number;
}
