import type { DamageTag } from "../../content/model/damage-tag";
import type { WeaponMechanics } from "./mech-systems";
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
export type AreaEffectKind = "fire" | "smoke";

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
export interface WeaponProfile extends WeaponMechanics {
  /**
   * Tiles the weapon reaches on level ground, Manhattan. Positive
   * integer; `1` is melee. Height adds to the distance a shot is held
   * against and, from above, to the reach (`weapon-reach-service`, #1119).
   */
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
  /**
   * Whether a shot from this weapon spends every remaining action point
   * (#1130). Absent, the unit kind's rule in `CombatTuning.attackEndsTurn`
   * decides, as it always did: a squad's attack costs one action and a
   * mech's or a bug's ends its turn. Present, it overrides that rule for
   * this weapon alone — a radio squad's SMG and a sniper's rifle are
   * one-shot-a-turn weapons in the hands of a kind that otherwise fires
   * twice — so the volume of fire is the weapon's, not the kind's.
   */
  readonly endsTurn?: boolean;
  /**
   * Reaction shots one overwatch with this weapon fires (#1138). Absent
   * means one, as every overwatch was before it: the watcher fires at
   * the first enemy step it can and is clear. A deployed turret's gun
   * says two, so its watch survives its first shot and takes a second
   * at the mover's next step, or at the next bug to move. Positive
   * integer; read through `overwatchShotsOf`.
   */
  readonly overwatchShots?: number;
  /**
   * What the hit is made of (campaign arc §10.2): the spitter's spit is
   * `["acid"]`. Absent or empty means plain damage, which nothing
   * resists. A target resisting any of the tags takes its best
   * resistance among them off every hit (`damageRange`).
   */
  readonly tags?: readonly DamageTag[];
  /**
   * Armour points the firer's armour-piercing rounds strip off each hit,
   * on top of `armorPen` (campaign arc §10.2): a mech carrying the
   * armoured autopsy's rounds loads them into every ballistic weapon it
   * fits (`isBallistic`). Absent means none. Kept apart from `armorPen`
   * so the weapon line can say where the extra comes from and so the
   * rules that read the gun's own penetration — how loud it is
   * (`noiseOf`) — hear the gun, not its ammunition.
   */
  readonly pierce?: number;
}

/** Reaction shots one overwatch with this weapon fires; `1` when it declares none (#1138). */
export function overwatchShotsOf(weapon: WeaponProfile): number {
  return weapon.overwatchShots ?? 1;
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
// Ballistic
// ===========================================

/** What `isBallistic` reads off a weapon: a part's, a stat sheet's or a profile's. */
export type BallisticSignature = Pick<
  WeaponProfile,
  "range" | "energy" | "beam" | "guided" | "aoe" | "aoeEffect"
>;

/**
 * True for a weapon that fires solid rounds straight at one thing:
 * what armour-piercing rounds can be loaded into (campaign arc §10.2).
 * Everything else is answered by what the weapon already declares:
 *
 * ```
 *   melee (range 1)          pile driver          a ram, not a round
 *   energy or a beam         laser, lance, beam   no round at all
 *   guided                   guided missile rack  a missile
 *   a blast or an effect     missile pod, mortar, scatter cannon,
 *                            flamer, howitzer…    shells that burst
 *   anything else            autocannon, heavy autocannon, rotary
 *                            cannon, railgun, siege railgun ──► true
 * ```
 *
 * Derived rather than declared so no weapon part has to be edited to
 * say so, and a new gun is sorted by the same facts the rules already
 * read.
 *
 * @param weapon - The weapon's reach and behaviours.
 * @returns True when it takes armour-piercing rounds.
 */
export function isBallistic(weapon: BallisticSignature): boolean {
  return (
    !isMeleeRange(weapon.range) &&
    weapon.energy !== true &&
    weapon.beam !== true &&
    weapon.guided !== true &&
    weapon.aoe === undefined &&
    weapon.aoeEffect === undefined
  );
}

/** Armour points the weapon's rounds pierce beyond its own penetration; `0` when it loads none. */
export function pierceOf(weapon: Pick<WeaponProfile, "pierce">): number {
  return Math.max(0, weapon.pierce ?? 0);
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
    weapon.beam === true ||
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
