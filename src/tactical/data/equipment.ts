import type {
  EquipmentDefinition,
  EquipmentId,
  HealProfile,
} from "../model/equipment";
import type { WeaponProfile } from "../model/weapon-profile";

// ===========================================
// Equipment (GDD §6.2.4, #1132)
// ===========================================
//
// What squads carry besides their weapon, each limited to a few uses a
// mission. Numbers, sized against the weapons in `unit-tuning.ts` (a
// carbine hits for 3, a missile pod bursts over five tiles for 22):
//
//   | item             | kind   | uses | AP | range | acc | dmg | pen | blast (r/falloff) | demo | delay | heal |
//   |------------------|--------|------|----|-------|-----|-----|-----|-------------------|------|-------|------|
//   | Radar dish       | radar  | 3    | 1  | 2     | —   | —   | —   | —                 | —    | —     | —    |
//   | Grenade          | blast  | 2    | 1  | 5     | 75  | 6   | 0   | 2 / 0.4           | 1    | —     | —    |
//   | Frag grenade     | blast  | 2    | 1  | 5     | 75  | 8   | 0   | 2 / 0.3           | 1    | —     | —    |
//   | Incendiary gren. | blast  | 2    | 1  | 5     | 75  | 8   | 0   | 2 / 0.3 + fire    | 1    | —     | —    |
//   | Breaching charge | charge | 1    | 1  | 2     | —   | 20  | 3   | 3 / 0.3           | 3    | 2     | —    |
//   | Medkit           | heal   | 4    | 1  | 5     | —   | —   | —   | 2 / —             | —    | —     | 10   |
//   | Field medkit     | heal   | 4    | 1  | 5     | —   | —   | —   | 2 / —             | —    | —     | 15   |
//   | Repair kit       | heal   | 2    | 1  | 5     | —   | —   | —   | 2 / —             | —    | —     | 25   |
//   | Turret           | turret | 2    | 1  | 2     | —   | —   | —   | —                 | —    | —     | —    |
//   | Capture net      | net    | 1    | 1  | 1     | —   | —   | —   | —                 | —    | —     | —    |
//
//   • The dish keeps its scan radius and battery in `radar-tuning.ts`;
//     only where it may be put and what it costs live here.
//   • A grenade is thrown: a wide, weak burst that clears fences and
//     crates (force 1) and finishes swarmers, and can be thrown at a
//     tile with nobody on it.
//   • A breaching charge is placed by hand two tiles out and goes off as
//     the player turn after next opens (placed on T, it waits through
//     T+1 and goes as T+2 opens), so the squad has a whole turn to step
//     away and a bug that walks onto it in either bug phase is caught.
//     It went off as T+1 opened at first, which caught a squad that
//     placed it with its last action (Executive Director, 2026-09-13,
//     #1134). Force 3 opens solid walls, which is what "breaching" means.
//   • A medkit or a repair kit is thrown like a grenade and mends the
//     user's own side in the grenade's footprint (Executive Director,
//     2026-09-14, #1138): the medkit 10 hit points to every organic unit
//     in it, four times a mission; the repair kit 25 to every mechanical
//     one, twice. Neither hurts anything or misses, and a unit at full
//     hit points takes nothing.
//   • A turret (#1138) is carried like the dish and put down as a unit
//     of its own; its gun, plate and battery are `turret-tuning.ts`.
//   • The infantry branch of the tech tree (campaign arc §10.3, #1179)
//     swaps items rather than retuning them, so a mission save keeps
//     the item it started with: frag grenades hit for 8 and lose less
//     to the edge (70 % and 40 % of the impact's damage at one and two
//     tiles, against 60 % and 20 %); incendiary grenades are the frag
//     grenade that also sets the footprint alight, the impact tile for
//     certain and 65 % and 30 % of the tiles one and two out, the
//     flamer's fire (`hazard-tuning.ts`); field medic training makes
//     the medkit mend 15 in place of 10. The swaps themselves are
//     `roster/data/infantry-upgrades.ts`.
//   • A capture net (#1179, campaign arc §6.9) is thrown over a bug on a
//     tile next to the squad once that bug is down to half its hit
//     points or less, and takes it alive; the squad carries it home one
//     movement point slower per action. One a mission, issued to every
//     squad once Pheromone Analysis is researched, never by a squad type:
//     it is the one infantry upgrade that adds an item rather than
//     swapping one (`roster/data/infantry-upgrades.ts`).

/**
 * How far a thrown kit goes and how wide it lands: the grenade's
 * numbers, which the kits share by construction (#1138) so "an AOE like
 * grenade" stays true when the grenade is retuned.
 */
const THROWN_KIT_RANGE = 5;
const THROWN_KIT_BLAST_RADIUS = 2;

/** What a frag grenade does where it lands; the incendiary grenade adds fire to it. */
const FRAG_PROFILE: WeaponProfile = {
  range: THROWN_KIT_RANGE,
  accuracy: 75,
  damage: 8,
  armorPen: 0,
  aoe: { radius: THROWN_KIT_BLAST_RADIUS, falloff: 0.3 },
  demoForce: 1,
};

/** What the medic's medkit mends; the field medkit mends more. */
const MEDKIT_HEAL: HealProfile = {
  amount: 10,
  target: "organic",
  radius: THROWN_KIT_BLAST_RADIUS,
};

/** The radio squad's scanner (#1130 battery; #1132 three uses). */
export const RADAR_DISH: EquipmentDefinition = {
  id: "radar-dish",
  name: "Radar dish",
  kind: "radar",
  uses: 3,
  apCost: 1,
  range: 2,
};

/** Every infantry squad's grenades. */
export const GRENADE: EquipmentDefinition = {
  id: "grenade",
  name: "Grenade",
  kind: "blast",
  uses: 2,
  apCost: 1,
  range: THROWN_KIT_RANGE,
  profile: {
    range: THROWN_KIT_RANGE,
    accuracy: 75,
    damage: 6,
    armorPen: 0,
    aoe: { radius: THROWN_KIT_BLAST_RADIUS, falloff: 0.4 },
    demoForce: 1,
  },
};

/**
 * Every squad's grenades once frag grenades are researched (campaign
 * arc §10.3): the grenade's throw and footprint, a third more damage,
 * and more of it reaching the edge.
 */
export const FRAG_GRENADE: EquipmentDefinition = {
  id: "frag-grenade",
  name: "Frag grenade",
  kind: "blast",
  uses: GRENADE.uses,
  apCost: GRENADE.apCost,
  range: THROWN_KIT_RANGE,
  profile: FRAG_PROFILE,
};

/**
 * Every squad's grenades once incendiary grenades are researched
 * (campaign arc §10.3): the frag grenade that also leaves fire, certain
 * on the impact tile and fading 35 % a tile. The fire is the flamer's
 * (`tile-effect-service`): it burns whoever stands in it as their phase
 * opens, either side, for two rounds.
 */
export const INCENDIARY_GRENADE: EquipmentDefinition = {
  ...FRAG_GRENADE,
  id: "incendiary-grenade",
  name: "Incendiary grenade",
  profile: {
    ...FRAG_PROFILE,
    aoeEffect: { kind: "fire", chance: 1, falloff: 0.35 },
  },
};

/** The rocket squad's breaching charge. */
export const BREACHING_CHARGE: EquipmentDefinition = {
  id: "breaching-charge",
  name: "Breaching charge",
  kind: "charge",
  uses: 1,
  apCost: 1,
  range: 2,
  profile: {
    range: 2,
    accuracy: 100,
    damage: 20,
    armorPen: 3,
    aoe: { radius: 3, falloff: 0.3 },
    demoForce: 3,
  },
  delayTurns: 2,
};

/** The medic squad's medkit (#1138): ten hit points to every organic unit in the area, four times. */
export const MEDKIT: EquipmentDefinition = {
  id: "medkit",
  name: "Medkit",
  kind: "heal",
  uses: 4,
  apCost: 1,
  range: THROWN_KIT_RANGE,
  heal: MEDKIT_HEAL,
};

/** The engineer squad's repair kit (#1138): twenty-five hit points to every mechanical unit in the area, twice. */
export const REPAIR_KIT: EquipmentDefinition = {
  id: "repair-kit",
  name: "Repair kit",
  kind: "heal",
  uses: 2,
  apCost: 1,
  range: THROWN_KIT_RANGE,
  heal: { amount: 25, target: "mechanical", radius: THROWN_KIT_BLAST_RADIUS },
};

/**
 * The medic squad's medkit once field medic training is researched
 * (campaign arc §10.3): the same kit, mending 15 in place of 10.
 */
export const FIELD_MEDKIT: EquipmentDefinition = {
  ...MEDKIT,
  id: "field-medkit",
  name: "Field medkit",
  heal: { ...MEDKIT_HEAL, amount: 15 },
};

/**
 * The engineer squad's deployable turret (#1138): two a mission, put
 * down within two tiles for an action, as the dish is. What the turret
 * then is — its gun, its plate, its battery — is `turret-tuning.ts`.
 */
export const TURRET: EquipmentDefinition = {
  id: "turret",
  name: "Turret",
  kind: "turret",
  uses: 2,
  apCost: 1,
  range: 2,
};

/**
 * The capture net (#1179): thrown over a bug next to the squad at half
 * its hit points or less, it takes the bug alive for the squad to carry
 * home. Half rather than the "0 HP" of the arc's one-line summary: a net
 * that waited for the killing blow would ask the player to land a shot
 * that must not kill, which no hit roll can promise. Issued by the
 * Pheromone Analysis upgrade (`INFANTRY_UPGRADES`), not by any squad type.
 */
export const CAPTURE_NET: EquipmentDefinition = {
  id: "capture-net",
  name: "Capture net",
  kind: "net",
  uses: 1,
  apCost: 1,
  range: 1,
  net: { captureAtHpFraction: 0.5, carryMovePenalty: 1 },
};

/** Every piece of equipment keyed by id, in catalogue order. */
export const EQUIPMENT: Readonly<Record<EquipmentId, EquipmentDefinition>> = {
  "mech-recon": {
    id: "mech-recon",
    name: "Recon beacon",
    kind: "radar",
    uses: 3,
    apCost: 1,
    range: 2,
    radar: { scanRange: 12, batteryTurns: 1 },
  },
  "mech-repair": {
    id: "mech-repair",
    name: "Field repair",
    kind: "heal",
    uses: 2,
    apCost: 1,
    range: 3,
    heal: { amount: 20, target: "mechanical", radius: 1 },
  },
  [RADAR_DISH.id]: RADAR_DISH,
  [GRENADE.id]: GRENADE,
  [BREACHING_CHARGE.id]: BREACHING_CHARGE,
  [MEDKIT.id]: MEDKIT,
  [REPAIR_KIT.id]: REPAIR_KIT,
  [TURRET.id]: TURRET,
  [FRAG_GRENADE.id]: FRAG_GRENADE,
  [INCENDIARY_GRENADE.id]: INCENDIARY_GRENADE,
  [FIELD_MEDKIT.id]: FIELD_MEDKIT,
  [CAPTURE_NET.id]: CAPTURE_NET,
};
