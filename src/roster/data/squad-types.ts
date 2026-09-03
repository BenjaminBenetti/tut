import type { SquadType } from "../model/squad-type";

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
//     difficulty 2, and the starter mech (129) is worth a bit over three
//     squads, so squads matter on their own (GDD §5.7) while a mech is
//     still the capital piece. Support types (engineer, medic) rate low
//     here and earn their keep through abilities in M2.

/** General-purpose infantry; the starter squad type. */
export const RIFLE_SQUAD: SquadType = {
  id: "rifle",
  name: "Rifle Squad",
  hireCost: 500,
  reinforceCostPerSoldier: 80,
  combatRating: 40,
  description:
    "Five riflemen with standard-issue carbines. Cheap, dependable, and good at holding a line against swarms.",
};

/** Anti-armour infantry carrying shoulder-fired rockets. */
export const ROCKET_SQUAD: SquadType = {
  id: "rocket",
  name: "Rocket Squad",
  hireCost: 750,
  reinforceCostPerSoldier: 120,
  combatRating: 56,
  description:
    "Rocket launchers for cracking brutes and egg spawners. Devastating per shot, thin on ammunition.",
};

/** Long-range marksmen. */
export const SNIPER_SQUAD: SquadType = {
  id: "sniper",
  name: "Sniper Squad",
  hireCost: 800,
  reinforceCostPerSoldier: 140,
  combatRating: 48,
  description:
    "Marksmen who pick off lurkers before they close. Excellent from rooftops, fragile up close.",
};

/** Field engineers who place and repair deployables. */
export const ENGINEER_SQUAD: SquadType = {
  id: "engineer",
  name: "Engineer Squad",
  hireCost: 650,
  reinforceCostPerSoldier: 110,
  combatRating: 28,
  description:
    "Combat engineers with tools and demolition charges. Weak in a firefight, invaluable around objectives.",
};

/** Medics who keep other squads on their feet. */
export const MEDIC_SQUAD: SquadType = {
  id: "medic",
  name: "Medic Squad",
  hireCost: 600,
  reinforceCostPerSoldier: 100,
  combatRating: 24,
  description:
    "Field medics who stabilise the wounded. They shoot back, but their real job is bringing everyone home.",
};

/** Every squad type available in M1, in catalogue order. */
export const SQUAD_TYPES: readonly SquadType[] = [
  RIFLE_SQUAD,
  ROCKET_SQUAD,
  SNIPER_SQUAD,
  ENGINEER_SQUAD,
  MEDIC_SQUAD,
];
