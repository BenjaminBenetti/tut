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
 * What a new campaign fields before the first purchase: two rifle squads
 * and one mech (#54). Placeholder composition until the campaign is
 * playable end to end; names are call signs, not people.
 */
export const STARTER_ROSTER: StarterRosterSpec = {
  squads: [
    { typeId: "rifle", name: "Alpha" },
    { typeId: "rifle", name: "Bravo" },
  ],
  mechs: [{ name: "Hammerhead", loadout: STARTER_LOADOUT }],
};
