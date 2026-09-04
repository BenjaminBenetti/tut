import type { WeaponProfile } from "./weapon-profile";

// ===========================================
// Ids
// ===========================================

/**
 * Names one weapon within a unit's template — `"arm"`, `"back"`,
 * `"bite"`. Stable for the life of the template, because an `Attack`
 * command carries it and a save stores charges under it.
 *
 * A plain string alias, never a branded type (ADR 0003 §2.4).
 */
export type WeaponId = string;

/**
 * Weapon id for a unit that carries exactly one — every squad and every
 * bug. A mech's weapons are named by the slot they are fitted in.
 */
export const PRIMARY_WEAPON_ID = "primary";

/**
 * What a single-weapon unit's attack is called. Squads and bugs have no
 * per-weapon content to name — a swarmer's bite is not a fitted part —
 * so the action reads the way it always did rather than inventing
 * flavour the data does not have.
 */
export const DEFAULT_WEAPON_NAME = "Attack";

// ===========================================
// Unit weapon
// ===========================================

/**
 * One attack a unit can make (#532). A mech carries an arm weapon and a
 * back weapon and offers both, each with its own range, damage and
 * accuracy; a squad or a bug carries exactly one and behaves as it
 * always has.
 *
 * ```
 *   UnitTemplate.weapons[]
 *     ├── { id: "arm",  name: "Autocannon",  profile: { range 10, … } }
 *     └── { id: "back", name: "Rocket Pod",  profile: { range 14, … } }
 *            │
 *            └─ Attack { attackerId, targetId, weaponId } ──► one shot
 * ```
 *
 * `name` is what the action bar and #529's context menu put in front of
 * the player, so it is the part's own name rather than a slot label:
 * "Autocannon", not "arm weapon".
 */
export interface UnitWeapon {
  /** Stable within the template; an `Attack` names it and a save keys charges by it. */
  readonly id: WeaponId;
  /** What the player sees in the action bar and the context menu. */
  readonly name: string;
  /** Range, accuracy, damage and penetration for this weapon alone. */
  readonly profile: WeaponProfile;
  /**
   * Shots before this weapon must reload or vent (#409). Absent means
   * unlimited, as for bugs. Counted per weapon: emptying the arm gun
   * does not silence the one on the back.
   */
  readonly charges?: number;
}

// ===========================================
// Helpers
// ===========================================

/**
 * The weapon `weaponId` names, or the unit's first weapon when it names
 * nothing. The first is what a bare "attack" has always meant, so a
 * caller that predates per-weapon attacks keeps working.
 */
export function weaponOf(
  weapons: readonly UnitWeapon[],
  weaponId: WeaponId | undefined,
): UnitWeapon | undefined {
  if (weaponId === undefined) {
    return weapons[0];
  }
  return weapons.find((weapon) => weapon.id === weaponId);
}

/** Id of the weapon a unit attacks with when nothing says otherwise. */
export function defaultWeaponId(
  weapons: readonly UnitWeapon[],
): WeaponId | undefined {
  return weapons[0]?.id;
}
