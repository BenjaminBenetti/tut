import type { EquipmentDefinition, EquipmentId } from "../model/equipment";

// ===========================================
// Equipment (GDD §6.2.4, #1132)
// ===========================================
//
// What squads carry besides their weapon, each limited to a few uses a
// mission. Numbers, sized against the weapons in `unit-tuning.ts` (a
// carbine hits for 3, a missile pod bursts over five tiles for 22):
//
//   | item             | kind   | uses | AP | range | acc | dmg | pen | blast (r/falloff) | demo | delay |
//   |------------------|--------|------|----|-------|-----|-----|-----|-------------------|------|-------|
//   | Radar dish       | radar  | 3    | 1  | 2     | —   | —   | —   | —                 | —    | —     |
//   | Grenade          | blast  | 2    | 1  | 5     | 75  | 6   | 0   | 2 / 0.4           | 1    | —     |
//   | Breaching charge | charge | 1    | 1  | 2     | —   | 20  | 3   | 3 / 0.3           | 3    | 2     |
//   | Turret           | turret | 2    | 1  | 2     | —   | —   | —   | —                 | —    | —     |
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
//   • A turret (#1138) is carried like the dish and put down as a unit
//     of its own; its gun, plate and battery are `turret-tuning.ts`.

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
  range: 5,
  profile: {
    range: 5,
    accuracy: 75,
    damage: 6,
    armorPen: 0,
    aoe: { radius: 2, falloff: 0.4 },
    demoForce: 1,
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

/** Every piece of equipment keyed by id, in catalogue order. */
export const EQUIPMENT: Readonly<Record<EquipmentId, EquipmentDefinition>> = {
  [RADAR_DISH.id]: RADAR_DISH,
  [GRENADE.id]: GRENADE,
  [BREACHING_CHARGE.id]: BREACHING_CHARGE,
  [TURRET.id]: TURRET,
};
