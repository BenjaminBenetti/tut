import type { MechPart } from "../model/mech-part";

// ===========================================
// Autopsy parts
// ===========================================

/** Id of the part the spitter autopsy unlocks (campaign arc §10.2). */
export const ACID_RESISTANT_PLATING = "utility-acid-resistant-plating";
/** Id of the part the Hive Guard autopsy unlocks (campaign arc §10.2). */
export const SPINE_PLATE_ARMOUR = "utility-spine-plate-armour";
/** Id of the part the Burrower autopsy unlocks (campaign arc §10.2). */
export const SEISMIC_SENSOR = "utility-seismic-sensor";
/** Id of the part the Broodmother autopsy unlocks (campaign arc §6.8, §10.2). */
export const MATRIARCH_CHITIN = "utility-matriarch-chitin";
/** Id of the part the armoured-carapace autopsy unlocks (campaign arc §10.2). */
export const ARMOUR_PIERCING_ROUNDS = "utility-armour-piercing-rounds";

/**
 * The counters the autopsies unlock (campaign arc §8, §10.2): one part
 * per species, above tier 1 so the tech tree gates it, and each unlocked
 * by exactly one autopsy node in `tech/data/autopsy-nodes.ts`. A counter
 * to a kind of hit resists that hit's damage tag (`traits.resist`), so
 * it goes through the same damage formula every other hit does.
 *
 * ```
 *   species     autopsy                    part                     counter
 *   spitter     Spitter Autopsy        ──► Acid-Resistant Plating   resist acid 3
 *   hive-guard  Hive Guard Autopsy     ──► Spine-Plate Armour       resist spine 3
 *   burrower    Burrower Autopsy       ──► Seismic Sensor           seismic range 10
 *   broodmother Broodmother Autopsy    ──► Matriarch Chitin         resist acid 2, spine 2
 *   armoured    Armoured Carapace      ──► Armour-Piercing Rounds   pierce 2
 *   (any of the three variants)
 * ```
 *
 * A counter is one trait the combat and vision rules already read:
 * `resist` against a damage tag, `pierce` for the mech's ballistic
 * weapons (`damageRange`), or `seismicRange` (`seismicContacts`).
 *
 * A species package adds its counter here: one part, and when it resists
 * a new kind of hit, one `DamageTag` (`content/model/damage-tag.ts`) for
 * its weapon to carry. The node that unlocks it is the other half
 * (`tech/data/autopsy-nodes.ts`).
 */
export const AUTOPSY_PARTS: readonly MechPart[] = [
  {
    id: ACID_RESISTANT_PLATING,
    name: "Acid-Resistant Plating",
    slot: "utility",
    tier: 2,
    cost: 600,
    // Lighter plate than composite, sealed against acid: every acid hit
    // loses three points after armour, which is the whole of a spit on
    // most frames. The weight is the radiator's, so the starter frame
    // can swap one for the other.
    stats: {
      armor: 6,
      mobility: 0,
      heat: 0,
      power: 0,
      accuracy: 0,
      firepower: 0,
      weight: 4,
    },
    description:
      "Sealed plates cast from spitter autopsy findings. Absorbs 3 damage from every acid hit.",
    traits: {
      resist: { acid: 3 },
    },
  },
  {
    id: SPINE_PLATE_ARMOUR,
    name: "Spine-Plate Armour",
    slot: "utility",
    tier: 2,
    cost: 700,
    // Layered plate grown from the guard's own shield, heavier than the
    // acid plating and a little thicker: a spine loses three points
    // after armour, which is most of what reaches a mech.
    stats: {
      armor: 8,
      mobility: 0,
      heat: 0,
      power: 0,
      accuracy: 0,
      firepower: 0,
      weight: 6,
    },
    description:
      "Layered plate modelled on the Hive Guard's shield. Absorbs 3 damage from every spine hit.",
    traits: {
      resist: { spine: 3 },
    },
  },
  {
    id: SEISMIC_SENSOR,
    name: "Seismic Sensor",
    slot: "utility",
    tier: 2,
    cost: 600,
    // Geophones in the feet and a listening core: light, a small draw on
    // the reactor, no plate. Ten tiles is a burrower's whole phase of
    // digging (two actions of five columns), so every burrower it feels
    // could be beside the mech by the next bug phase. A burrower bites
    // only from beside its mark or after surfacing, so none near the
    // mech comes up and bites without first showing for a player turn.
    // Measured on open ground: one beside its mark comes up and bites,
    // one 2 to 6 away comes up that phase and bites the next, and one
    // 7 or more away digs in and lies in wait.
    stats: {
      armor: 0,
      mobility: 0,
      heat: 0,
      power: -4,
      accuracy: 0,
      firepower: 0,
      weight: 3,
    },
    description:
      "Geophones tuned to a burrower's digging from its autopsy. Shows the squad every burrowed bug within 10 tiles of this mech; the ground still shields them from fire.",
    traits: {
      seismicRange: 10,
    },
  },
  {
    id: MATRIARCH_CHITIN,
    name: "Matriarch Chitin",
    slot: "utility",
    tier: 3,
    cost: 1500,
    // Plate cut from the Broodmother's bone cage. Her brood's weapons
    // were never made to hurt their mother: it takes two points off
    // every acid hit and every spine, where each single autopsy plate
    // takes three off one kind, and it is heavier plate than either,
    // for a tier 3 price. Not unique: the part model has no once-only
    // rule, so her autopsy is the rare thing, not the part.
    stats: {
      armor: 14,
      mobility: 0,
      heat: 0,
      power: 0,
      accuracy: 0,
      firepower: 0,
      weight: 6,
    },
    description:
      "Plate cut from the Broodmother's bone cage, the thickest carapace the swarm grows and proof against her brood: absorbs 2 damage from every acid and every spine hit.",
    traits: {
      resist: { acid: 2, spine: 2 },
    },
  },
  {
    id: ARMOUR_PIERCING_ROUNDS,
    name: "Armour-Piercing Rounds",
    slot: "utility",
    tier: 2,
    cost: 650,
    // Tungsten-cored ammunition for every gun on the mech that fires
    // rounds (`isBallistic`). Two is the most plate a variant adds
    // over its base (the armoured brute's +2), so the rounds give back
    // what the carapace took: an autocannon hits an armoured brute as
    // it hits a plain one, and every heavier gun ignores its plate.
    stats: {
      armor: 0,
      mobility: 0,
      heat: 0,
      power: 0,
      accuracy: 0,
      firepower: 0,
      weight: 3,
    },
    description:
      "Tungsten-cored rounds from the armoured carapace autopsy. Every ballistic weapon on this mech pierces 2 more armour.",
    traits: {
      pierce: 2,
    },
  },
];
