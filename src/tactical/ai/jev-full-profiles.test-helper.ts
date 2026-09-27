import type { EquipmentDefinition } from "../model/equipment";
import type { MechSystems } from "../model/mech-systems";
import type { WeaponProfile } from "../model/weapon-profile";

// ===========================================
// Profiles with every optional field set
// ===========================================
//
// Jev forwards a unit's weapon profiles, its mech systems and its
// equipment definitions to the relay whole, and the relay's request
// shape is closed: an unlisted field is a 400 before any model call
// (#1179, the Armour-Piercing Rounds `pierce` that failed live). Each
// object below is typed `Required<…>`, so a new optional field on the
// game's type fails `tsc` here until it is added, and the relay
// contract test (tools/jev/relay-contract.test.mjs) then sends it.
//
//   game type ──Required<>──▶ FULL_* ──scenario──▶ captureJev ──▶ validGameRequest

/** A weapon profile carrying every field `WeaponProfile` defines. */
export const FULL_WEAPON_PROFILE: Required<WeaponProfile> = {
  range: 6,
  accuracy: 70,
  damage: 4,
  armorPen: 1,
  aoe: { radius: 2, falloff: 0.4 },
  aoeEffect: { kind: "smoke", chance: 1, falloff: 0.1 },
  demoForce: 1,
  endsTurn: false,
  overwatchShots: 2,
  tags: ["acid"],
  pierce: 2,
  heat: 1,
  energy: true,
  indirect: true,
  minRange: 0,
  requiresBrace: true,
  guided: true,
  beam: false,
  cooldown: 1,
};

/** Mech systems carrying every field `MechSystems` defines. */
export const FULL_MECH_SYSTEMS: Required<MechSystems> = {
  heatCapacity: 100,
  cooling: 2,
  idleHeat: 0,
  movementHeat: 1,
  sightBonus: 1,
  jumpRange: 4,
  jumpHeight: 4,
  jumpHeat: 1,
  allTerrain: true,
  braceAccuracy: 5,
  stationaryAccuracy: 5,
  energyHeatFactor: 0.5,
  ablativeHits: 2,
  ablativeAbsorption: 1,
  coolantUses: 2,
  designationAccuracy: 5,
  equipment: [],
  resist: { acid: 3, spine: 1 },
  pierce: 2,
  seismicRange: 10,
};

/** An equipment definition carrying every field `EquipmentDefinition` defines. */
export const FULL_EQUIPMENT: Required<EquipmentDefinition> = {
  id: "full-kit",
  name: "Full kit",
  kind: "blast",
  uses: 2,
  apCost: 1,
  range: 5,
  radar: { scanRange: 8, batteryTurns: 3 },
  profile: FULL_WEAPON_PROFILE,
  heal: { amount: 2, target: "organic", radius: 1 },
  delayTurns: 2,
  net: { captureAtHpFraction: 0.5, carryMovePenalty: 1 },
};
