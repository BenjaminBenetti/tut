import type { MechPart } from "../model/mech-part";

// ===========================================
// Autopsy parts
// ===========================================

/** Id of the part the spitter autopsy unlocks (campaign arc §10.2). */
export const ACID_RESISTANT_PLATING = "utility-acid-resistant-plating";
/** Id of the part the Hive Guard autopsy unlocks (campaign arc §10.2). */
export const SPINE_PLATE_ARMOUR = "utility-spine-plate-armour";

/**
 * The counters the autopsies unlock (campaign arc §8, §10.2): one part
 * per species, above tier 1 so the tech tree gates it, and each unlocked
 * by exactly one autopsy node in `tech/data/autopsy-nodes.ts`. A counter
 * to a kind of hit resists that hit's damage tag (`traits.resist`), so
 * it goes through the same damage formula every other hit does.
 *
 * ```
 *   species     autopsy                 part                     counter
 *   spitter     Spitter Autopsy     ──► Acid-Resistant Plating   resist acid 3
 *   hive-guard  Hive Guard Autopsy  ──► Spine-Plate Armour       resist spine 3
 * ```
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
];
