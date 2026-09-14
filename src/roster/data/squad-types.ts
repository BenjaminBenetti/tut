import type { SquadType } from "../model/squad-type";
import {
  BREACHING_CHARGE,
  GRENADE,
  MEDKIT,
  RADAR_DISH,
  REPAIR_KIT,
} from "../../tactical/data/equipment";

// ===========================================
// Squad types (GDD §5.7)
// ===========================================
//
// Costs and ratings are M1 placeholder tuning for the auto-resolver;
// expect them to move once the economy (#44, #60) and resolver (#62)
// land. Rules of thumb used here:
//
//   • hireCost ≈ reinforceCostPerSoldier × SQUAD_MAX_STRENGTH + a premium
//     for training, so reinforcing is cheaper than re-hiring.
//   • combatRating is the squad's worth in a straight fight, on the
//     auto-resolver's scale where one point of mission difficulty is
//     worth `difficultyScale` (40) rating (#336): a full rifle squad is
//     an even fight alone at difficulty 1, two rifle squads at
//     difficulty 2, and the starter mech (113 since #1130 halved the
//     Vanguard's plate) is worth nearly three squads, so squads matter
//     on their own (GDD §5.7) while a mech is still the capital piece. Support types (engineer, medic) rate low
//     here and earn their keep through abilities in M2.
//   • equipment (#1132): every squad carries grenades; the radio squad
//     adds its radar dish and the rocket squad a breaching charge; the
//     medic squad carries a medkit and the engineer squad a repair kit
//     (#1138). The items and their uses are defined in
//     `tactical/data/equipment.ts`.

/** General-purpose infantry; the starter squad type. */
export const RIFLE_SQUAD: SquadType = {
  id: "rifle",
  name: "Rifle Squad",
  hireCost: 500,
  reinforceCostPerSoldier: 80,
  combatRating: 40,
  description:
    "Five riflemen with standard-issue carbines, two bursts a turn. Cheap, dependable, and good at holding a line against swarms.",
  equipment: [GRENADE.id],
};

/** Anti-armour infantry carrying shoulder-fired rockets. */
export const ROCKET_SQUAD: SquadType = {
  id: "rocket",
  name: "Rocket Squad",
  hireCost: 750,
  reinforceCostPerSoldier: 120,
  combatRating: 56,
  description:
    "Shoulder-fired rocket launchers for cracking brutes and egg spawners: one shot a turn that bursts over the tiles around its mark and brings down doors and dumpsters. Devastating per shot, thin on ammunition.",
  equipment: [GRENADE.id, BREACHING_CHARGE.id],
};

/** Long-range marksmen. */
export const SNIPER_SQUAD: SquadType = {
  id: "sniper",
  name: "Sniper Squad",
  hireCost: 800,
  reinforceCostPerSoldier: 140,
  combatRating: 48,
  description:
    "Marksmen with long rifles: one carefully placed shot a turn, out to the edge of what the squad can see. Excellent from rooftops, fragile up close.",
  equipment: [GRENADE.id],
};

/** Field engineers who place and repair deployables. */
export const ENGINEER_SQUAD: SquadType = {
  id: "engineer",
  name: "Engineer Squad",
  hireCost: 650,
  reinforceCostPerSoldier: 110,
  combatRating: 28,
  description:
    "Combat engineers with shotguns, tools and demolition charges: two blasts a turn at arm's length, nothing at range. Invaluable around objectives. Carries a repair kit: twice a mission, every mech in a grenade's footprint gets 25 hit points back.",
  equipment: [GRENADE.id, REPAIR_KIT.id],
};

/** Medics who keep other squads on their feet. */
export const MEDIC_SQUAD: SquadType = {
  id: "medic",
  name: "Medic Squad",
  hireCost: 600,
  reinforceCostPerSoldier: 100,
  combatRating: 24,
  description:
    "Field medics who stabilise the wounded. They shoot back with carbines, two bursts a turn, but their real job is bringing everyone home. Carries a medkit: four times a mission, every squad in a grenade's footprint gets 10 hit points back.",
  equipment: [GRENADE.id, MEDKIT.id],
};

/** Signals infantry that locates hidden bugs and egg nests. */
export const RADIO_SQUAD: SquadType = {
  id: "radio",
  name: "Radio Squad",
  hireCost: 650,
  reinforceCostPerSoldier: 110,
  combatRating: 28,
  description:
    "Signals infantry with SMGs and portable radar. One hard-hitting burst a turn at short range. Carries three scanners a mission: deploy one on a free tile within 2 tiles for 1 AP, and hidden enemies and egg nests appear as red blips within a 30-tile circle for 3 turns.",
  equipment: [GRENADE.id, RADAR_DISH.id],
};

/** Every available squad type, in catalogue order. */
export const SQUAD_TYPES: readonly SquadType[] = [
  RIFLE_SQUAD,
  ROCKET_SQUAD,
  SNIPER_SQUAD,
  ENGINEER_SQUAD,
  MEDIC_SQUAD,
  RADIO_SQUAD,
];
