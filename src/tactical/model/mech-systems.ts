import type { DamageResistances } from "./damage-resistance";

/** Capabilities supplied by fitted parts. Missing values preserve older templates. */
export interface MechTraits {
  readonly heatCapacity?: number;
  readonly sightBonus?: number;
  readonly jumpRange?: number;
  /** Maximum landing elevation change in half-storey map layers. */
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
  /**
   * Points each tagged hit loses (campaign arc §10.2), e.g. acid-resistant
   * plating's `{ acid: 3 }`. Absent on every part and mech that resists
   * nothing.
   */
  readonly resist?: DamageResistances;
  /**
   * Armour points each hit of the mech's ballistic weapons strips off
   * the target, on top of the weapon's own `armorPen` (campaign arc
   * §10.2): the armoured autopsy's armour-piercing rounds give `2`.
   * Which weapons are ballistic is `isBallistic`. Absent on every part
   * and mech that loads no such rounds.
   */
  readonly pierce?: number;
  /**
   * Tiles, by the ground-plane Manhattan measure, within which the mech
   * feels burrowed bugs through the ground (campaign arc §10.2): the
   * Burrower autopsy's seismic sensor gives `10`. Read by
   * `seismicContacts`. Absent on every part and mech that carries no
   * sensor.
   */
  readonly seismicRange?: number;
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
