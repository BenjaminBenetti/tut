import type { MechLoadout } from "../model/mech-loadout";
import type { StarterRosterSpec } from "../model/starter-roster-spec";

// ===========================================
// Starter loadout
// ===========================================

/**
 * The loadout the starting mech is built from, and the first saved
 * template (GDD §5.8). Tier-1 parts on the light Vanguard chassis: it
 * fills the chassis' weight allowance exactly, so the first upgrade is a
 * swap rather than an add. Every id must exist in `STARTER_PARTS` and fit
 * the chassis; the data test checks.
 */
export const STARTER_LOADOUT: MechLoadout = {
  name: "Skirmisher",
  chassisId: "chassis-vanguard",
  legsId: "legs-strider",
  armsId: "arms-manipulator",
  armWeaponId: "arm-weapon-autocannon",
  backWeaponId: "back-weapon-missile-pod",
  utilityIds: ["utility-radiator"],
};

// ===========================================
// Starter roster
// ===========================================

/**
 * What a new campaign fields before the first purchase: two rifle squads,
 * a radio squad, a rocket squad and one mech (#54, #1132). The rifles
 * hold the line, the radio's scanner finds the egg nests before the
 * force walks into them, and the rocket squad's launcher and breaching
 * charge crack the nests once found — so the first mission can be played
 * the way the design means it to be, with every tool at hand. The two
 * new squads follow the rifles so the ids of the original force
 * (`squad-1`, `squad-2`, `mech-1`) and the order units take the field in
 * are what they always were. Names are call signs, not people.
 */
export const STARTER_ROSTER: StarterRosterSpec = {
  squads: [
    { typeId: "rifle", name: "Alpha" },
    { typeId: "rifle", name: "Bravo" },
    { typeId: "radio", name: "Charlie" },
    { typeId: "rocket", name: "Delta" },
  ],
  mechs: [{ name: "Hammerhead", loadout: STARTER_LOADOUT }],
};
