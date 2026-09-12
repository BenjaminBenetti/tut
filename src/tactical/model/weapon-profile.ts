// ===========================================
// Area of effect
// ===========================================

/**
 * The blast a weapon deals its damage over (#1121). Every tile within
 * `radius` of the impact takes the weapon's damage scaled by how far it
 * is from the centre; `falloff` is the share lost per tile.
 *
 * ```
 *   radius 2, falloff 0.4
 *
 *         ·  20% ·
 *      ·  60% 60% 60% ·          share of the weapon's damage
 *     20% 60% 100% 60% 20%       at each tile of the footprint
 *      ·  60% 60% 60% ·
 *         ·  20% ·
 * ```
 *
 * A weapon without one hits its target and nothing else, as every
 * weapon did before #1121.
 */
export interface AreaOfEffect {
  /** Manhattan tiles from the impact the blast reaches. `0` is the impact tile alone. Non-negative integer. */
  readonly radius: number;
  /** Share of the weapon's damage lost per tile from the impact, in `[0, 1]`. */
  readonly falloff: number;
}

/** What a blast can leave on the tiles it reaches. Closed; `fire` is the first. */
export type AreaEffectKind = "fire";

/**
 * An effect a blast leaves on the ground (#1121): each tile in the
 * footprint rolls `chance` less `falloff` per tile from the impact, and
 * a tile that passes gets the effect — a fire, which burns whoever
 * stands in it on its own turn (`tile-effect-service`).
 */
export interface AreaEffect {
  readonly kind: AreaEffectKind;
  /** Chance in `[0, 1]` that the impact tile itself catches the effect. */
  readonly chance: number;
  /** Share of that chance lost per tile from the impact, in `[0, 1]`, on the same curve as the damage. */
  readonly falloff: number;
}

// ===========================================
// Weapon profile
// ===========================================

/**
 * How a unit attacks (GDD §6.2). Shared by squads, mechs and bugs so the
 * attack resolver has one shape to read; bug species (#322) carry one in
 * their data, roster units derive theirs at mission start (#321).
 *
 * Since #1121 a weapon can also carry a blast, an effect the blast
 * leaves behind and a demolition force. All three are optional and all
 * three default to nothing, so a profile written before them fires
 * exactly as it did.
 */
export interface WeaponProfile {
  /** Tiles the weapon reaches, Manhattan. Positive integer; `1` is melee. */
  readonly range: number;
  /** Base hit chance in percent before cover and elevation. In `[0, 100]`. */
  readonly accuracy: number;
  /** Hit points removed by one hit before armor. Positive. */
  readonly damage: number;
  /** Armor points ignored by each hit. Non-negative. */
  readonly armorPen: number;
  /** The blast the damage is spread over; absent for a weapon that hits one thing. */
  readonly aoe?: AreaOfEffect;
  /** What the blast leaves on the ground; absent for a weapon that leaves nothing. */
  readonly aoeEffect?: AreaEffect;
  /**
   * How hard the weapon hits structures (#1121). `0`, the default, breaks
   * nothing. `1` destroys barriers, fences and cars; `2` heavy props,
   * doors and windows; `3` solid walls. Which structure needs which
   * force is data: `PropDefinition.demolition` and `DemolitionTuning`.
   */
  readonly demoForce?: number;
}

// ===========================================
// Melee
// ===========================================

/** Reach of a weapon that has to be in contact to be used. */
export const MELEE_RANGE = 1;

/**
 * True when the weapon has to be in contact to be used (#446).
 *
 * Cover is a ranged concept: it says a shooter's line is obstructed. A
 * claw at arm's length is not obstructed by the boulder the defender is
 * standing behind, and — worse — the flank rule would read that boulder
 * as an exposed angle and *raise* the attacker's chance, so a player who
 * took cover was punished for it. Cover protects against melee
 * structurally instead: a prop tile cannot be stood on, so it denies an
 * approach rather than granting a percentage (Director's ruling, #446).
 */
export function isMelee(weapon: WeaponProfile): boolean {
  return isMeleeRange(weapon.range);
}

/**
 * True when a weapon of this reach has to be in contact to be used.
 *
 * The range alone, for callers that have the number without the profile
 * — the presentation layer reads it off `AttackResolvedEvent` (#457).
 * It exists so "was that melee" is answered in one place: the animation
 * queue used to decide by measuring the world distance between the two
 * models, which disagrees with the rules exactly where geometry and
 * weapon part company. A rifle squad firing at the tile next door is
 * within any distance threshold, and a melee attacker striking from a
 * rooftop is outside one.
 */
export function isMeleeRange(range: number): boolean {
  return range <= MELEE_RANGE;
}

// ===========================================
// Area and demolition
// ===========================================

/** The force the weapon brings against structures; `0` when it declares none. */
export function demoForceOf(weapon: WeaponProfile): number {
  return weapon.demoForce ?? 0;
}

/** Tiles from the impact the weapon's blast reaches; `0` for a weapon with no blast. */
export function blastRadiusOf(weapon: WeaponProfile): number {
  return weapon.aoe?.radius ?? 0;
}

/**
 * True when the weapon has something to do at a tile with no enemy on
 * it (#1121): a blast to spread, an effect to leave, or a force to
 * bring against what stands there. This is the rule that opens Attack
 * on a tile; a plain rifle has nothing to shoot at the ground for.
 */
export function canTargetTile(weapon: WeaponProfile): boolean {
  return (
    weapon.aoe !== undefined ||
    weapon.aoeEffect !== undefined ||
    demoForceOf(weapon) > 0
  );
}

/**
 * True when the weapon does anything beyond hitting the thing it was
 * aimed at: the resolver runs the blast, the demolition and the effect
 * only for these, so every other weapon's shot is untouched by #1121.
 */
export function hasImpact(weapon: WeaponProfile): boolean {
  return canTargetTile(weapon);
}

/**
 * The share of a value that survives `distance` tiles of `falloff`, in
 * `[0, 1]`: one at the impact, less `falloff` per tile, never below
 * zero. Shared by the damage and the effect chance so the two fade on
 * the same curve.
 */
export function falloffShare(falloff: number, distance: number): number {
  return Math.max(0, 1 - falloff * Math.max(0, distance));
}
