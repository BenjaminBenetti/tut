// ===========================================
// Damage tag
// ===========================================

/**
 * What a hit is made of, beyond how hard it lands (campaign arc §10.2):
 * the spitter's acid and the Hive Guard's spines. A weapon lists
 * its tags (`WeaponProfile.tags`), a mech part lists what it resists
 * (`MechTraits.resist`), and the damage formula subtracts the resistance
 * from every hit whose weapon carries the tag. A hit with no tag is
 * plain damage and nothing resists it.
 *
 * Shared vocabulary (ADR 0002 §2.1): bug species tag their weapons,
 * roster parts resist tags, the tactical resolver applies them and the
 * UI names them. A closed union, so a misspelt tag fails to compile; a
 * species package that brings a new kind of hit appends one member here
 * and one entry in `DAMAGE_TAGS`.
 *
 * | Tag     | Carried by                       | Resisted by            |
 * |---------|----------------------------------|------------------------|
 * | `acid`  | the spitter's spit (#1179)       | acid-resistant plating |
 * | `spine` | the Hive Guard's spines (#1179)  | spine-plate armour     |
 */
export type DamageTag = "acid" | "spine";

/** Every damage tag, in a fixed order. Append, never insert. */
export const DAMAGE_TAGS: readonly DamageTag[] = ["acid", "spine"];
