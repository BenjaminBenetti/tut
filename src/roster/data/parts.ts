import { ADVANCED_PARTS } from "./advanced-parts";
import type { MechPart } from "../model/mech-part";

/**
 * Every part a new campaign starts with. Tier 1 is buyable from day one;
 * the few tier 2 entries give the mech bay something to save up for.
 *
 * Tuning is placeholder until the auto-resolver (#62) and stat sheet (#49)
 * exist. Rules of thumb used here:
 *   - a chassis' `stats.power` equals its `capacity.powerOutput`, so a
 *     validator can sum `power` over all parts to get the balance
 *   - fitted parts draw power (negative); the auxiliary generator is the
 *     one exception and supplies it
 *   - only weapons have `firepower`
 *   - a mech built from the cheapest part in every slot fits every chassis
 *   - every chassis is the best at exactly one of armor, mobility,
 *     utility slots and price, so the trade-off reads at a glance
 *     (#1130; the table is in the chassis section below)
 */
export const STARTER_PARTS: readonly MechPart[] = [
  // ===========================================
  // Chassis
  // ===========================================
  //
  // Four frames, one for each thing a player might want from a mech,
  // and each is the best at exactly one of them (Executive Director,
  // 2026-09-13, #1130). `parts.test.ts` pins the table:
  //
  //   | chassis  | tier | cost | armor | mobility | slots | weight / power |
  //   |----------|------|------|-------|----------|-------|----------------|
  //   | Vanguard |  1   |  800 |  10   |    3     |   2   |   40 t /  30   |  PRICE
  //   | Courser  |  1   | 1400 |  12   |    6     |   2   |   44 t /  28   |  SPEED
  //   | Bulwark  |  1   | 1800 |  40   |    1     |   3   |   70 t /  40   |  ARMOR
  //   | Atlas    |  2   | 3200 |  28   |    2     |   5   |   95 t /  60   |  UTILITY
  //
  // The Vanguard is the starter frame and the cheap one: it carries the
  // starter loadout to the tonne and little more, and its plate is half
  // what it was. The Courser keeps its speed under a load that would
  // slow the Vanguard to a walk. The Bulwark shrugs off a brute and
  // carries a real gun, and pays for it in every step. The Atlas is the
  // capital ship: the reactor and the slots to fit everything at once,
  // at a price that hurts to lose.
  {
    id: "chassis-vanguard",
    hullHp: 35,
    traits: { heatCapacity: 20 },
    name: "Vanguard",
    slot: "chassis",
    tier: 1,
    cost: 800,
    stats: {
      armor: 10,
      mobility: 3,
      heat: -2,
      power: 30,
      accuracy: 0,
      firepower: 0,
      weight: 20,
    },
    capacity: { maxWeight: 40, powerOutput: 30, utilitySlots: 2 },
    description:
      "Budget frame and thin plate. Cheap enough to lose, which is the point.",
  },
  {
    id: "chassis-courser",
    hullHp: 28,
    traits: { heatCapacity: 22 },
    name: "Courser",
    slot: "chassis",
    tier: 1,
    cost: 1400,
    stats: {
      armor: 12,
      mobility: 6,
      heat: -2,
      power: 28,
      accuracy: 0,
      firepower: 0,
      weight: 16,
    },
    capacity: { maxWeight: 44, powerOutput: 28, utilitySlots: 2 },
    description:
      "Light frame built for speed. Carries little, but gets there first.",
  },
  {
    id: "chassis-bulwark",
    hullHp: 80,
    traits: { heatCapacity: 28 },
    name: "Bulwark",
    slot: "chassis",
    tier: 1,
    cost: 1800,
    stats: {
      armor: 40,
      mobility: 1,
      heat: -3,
      power: 40,
      accuracy: 0,
      firepower: 0,
      weight: 35,
    },
    capacity: { maxWeight: 70, powerOutput: 40, utilitySlots: 3 },
    description:
      "Heavy plated frame. Slow, but it can shrug off a brute and carry a real gun.",
  },
  {
    id: "chassis-atlas",
    hullHp: 75,
    traits: { heatCapacity: 32 },
    name: "Atlas",
    slot: "chassis",
    tier: 2,
    cost: 3200,
    stats: {
      armor: 28,
      mobility: 2,
      heat: -4,
      power: 60,
      accuracy: 0,
      firepower: 0,
      weight: 45,
    },
    capacity: { maxWeight: 95, powerOutput: 60, utilitySlots: 5 },
    description:
      "Capital-class frame with a reactor to match and room for every fitting. Losing one is a bad day.",
  },

  // ===========================================
  // Legs
  // ===========================================
  {
    id: "legs-strider",
    name: "Strider Legs",
    slot: "legs",
    tier: 1,
    cost: 350,
    stats: {
      armor: 5,
      mobility: 2,
      heat: 0,
      power: -4,
      accuracy: 0,
      firepower: 0,
      weight: 8,
    },
    description:
      "Long-stride actuators. Cheap mobility at the cost of plating.",
  },
  {
    id: "legs-bastion",
    name: "Bastion Legs",
    slot: "legs",
    tier: 1,
    cost: 450,
    stats: {
      armor: 15,
      mobility: 0,
      heat: 0,
      power: -6,
      accuracy: 0,
      firepower: 0,
      weight: 14,
    },
    description: "Armoured pylons. They do not hurry, and they do not fold.",
  },
  {
    id: "legs-jumper",
    traits: { jumpRange: 5, jumpHeight: 2, jumpHeat: 5 },
    name: "Jumper Legs",
    slot: "legs",
    tier: 2,
    cost: 900,
    stats: {
      armor: 8,
      mobility: 3,
      heat: 1,
      power: -10,
      accuracy: 0,
      firepower: 0,
      weight: 12,
    },
    description:
      "Hydraulic jump assist. Power hungry, but it clears rubble in a single bound.",
  },

  // ===========================================
  // Arms
  // ===========================================
  {
    id: "arms-manipulator",
    name: "Manipulator Arms",
    slot: "arms",
    tier: 1,
    cost: 300,
    stats: {
      armor: 5,
      mobility: 0,
      heat: 0,
      power: -3,
      accuracy: 5,
      firepower: 0,
      weight: 6,
    },
    description:
      "General-purpose arms. Steady enough to aim, light enough to carry.",
  },
  {
    id: "arms-brace",
    traits: { braceAccuracy: 5 },
    name: "Brace Arms",
    slot: "arms",
    tier: 1,
    cost: 450,
    stats: {
      armor: 10,
      mobility: -1,
      heat: 0,
      power: -4,
      accuracy: 10,
      firepower: 0,
      weight: 10,
    },
    description: "Recoil-braced mounts. Heavy, but the gun stays on target.",
  },
  {
    id: "arms-tracker",
    name: "Tracker Arms",
    slot: "arms",
    tier: 2,
    cost: 950,
    stats: {
      armor: 6,
      mobility: 0,
      heat: 1,
      power: -8,
      accuracy: 18,
      firepower: 0,
      weight: 8,
    },
    description: "Servo-stabilised arms with an integrated lead calculator.",
  },

  // ===========================================
  // Arm weapons
  // ===========================================
  {
    id: "arm-weapon-autocannon",
    name: "Autocannon",
    slot: "arm-weapon",
    tier: 1,
    cost: 500,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 3,
      power: -6,
      accuracy: 0,
      firepower: 18,
      weight: 10,
    },
    description: "The workhorse. Reliable damage at any range that matters.",
    // Cannon shells go through a car (#1121).
    weapon: { range: 10, armorPen: 2, demoForce: 1 },
  },
  {
    id: "arm-weapon-flamer",
    name: "Flamer",
    slot: "arm-weapon",
    tier: 1,
    cost: 400,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 6,
      power: -4,
      accuracy: 10,
      firepower: 14,
      weight: 7,
    },
    description: "Hard to miss with, hard on the heat sinks. Swarmers hate it.",
    // A gout of burning fuel: it washes over the tile beside its mark at
    // half strength and leaves most of what it touches burning (#1121).
    weapon: {
      range: 3,
      armorPen: 0,
      aoe: { radius: 1, falloff: 0.5 },
      aoeEffect: { kind: "fire", chance: 0.8, falloff: 0.3 },
    },
  },
  {
    id: "arm-weapon-laser",
    name: "Pulse Laser",
    slot: "arm-weapon",
    tier: 1,
    cost: 550,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 4,
      power: -10,
      accuracy: 15,
      firepower: 12,
      weight: 5,
    },
    description: "Light and precise. Draws heavily on the reactor.",
    // Precise means precise: one thing, nothing around it, nothing broken.
    weapon: { range: 12, armorPen: 1, energy: true },
  },
  {
    id: "arm-weapon-railgun",
    name: "Railgun",
    slot: "arm-weapon",
    tier: 2,
    cost: 1100,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 5,
      power: -14,
      accuracy: 5,
      firepower: 30,
      weight: 14,
    },
    description: "One slug, one brute. Needs a chassis that can feed it.",
    // The slug keeps going: a dumpster or a door does not stop it (#1121).
    weapon: { range: 14, armorPen: 4, demoForce: 2 },
  },

  // ===========================================
  // Back weapons
  // ===========================================
  {
    id: "back-weapon-missile-pod",
    name: "Missile Pod",
    slot: "back-weapon",
    tier: 1,
    cost: 650,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 4,
      power: -5,
      accuracy: -5,
      firepower: 22,
      weight: 12,
    },
    description: "Shoulder-mounted salvo launcher. Loud, and the bugs notice.",
    // A salvo bursts over the tiles beside its mark and clears light cover (#1121).
    weapon: {
      range: 14,
      armorPen: 1,
      aoe: { radius: 1, falloff: 0.5 },
      demoForce: 1,
    },
  },
  {
    id: "back-weapon-mortar",
    name: "Mortar",
    slot: "back-weapon",
    tier: 1,
    cost: 600,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 3,
      power: -3,
      accuracy: -10,
      firepower: 26,
      weight: 15,
    },
    description:
      "Indirect fire over the rooftops. Where it lands is a matter of faith.",
    // The widest blast on the arsenal, and heavy enough to open a doorway (#1121).
    weapon: {
      range: 16,
      minRange: 3,
      indirect: true,
      armorPen: 0,
      aoe: { radius: 2, falloff: 0.4 },
      demoForce: 2,
    },
  },
  {
    id: "back-weapon-rotary-cannon",
    name: "Rotary Cannon",
    slot: "back-weapon",
    tier: 2,
    cost: 1300,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 7,
      power: -12,
      accuracy: 0,
      firepower: 34,
      weight: 18,
    },
    description: "Six barrels of persuasion. Bring radiators.",
    // Volume of fire chews through a barricade (#1121).
    weapon: { range: 8, armorPen: 3, demoForce: 1 },
  },

  // ===========================================
  // Utilities
  // ===========================================
  {
    id: "utility-armor-plating",
    name: "Armour Plating",
    slot: "utility",
    tier: 1,
    cost: 300,
    stats: {
      armor: 12,
      mobility: -1,
      heat: 0,
      power: 0,
      accuracy: 0,
      firepower: 0,
      weight: 8,
    },
    description: "Bolt-on plates. Simple, heavy, effective.",
  },
  {
    id: "utility-radiator",
    name: "Radiator",
    slot: "utility",
    tier: 1,
    cost: 250,
    stats: {
      armor: 0,
      mobility: 0,
      heat: -4,
      power: -2,
      accuracy: 0,
      firepower: 0,
      weight: 4,
    },
    description: "Extra heat sinks so the guns keep firing.",
  },
  {
    id: "utility-targeting-computer",
    name: "Targeting Computer",
    slot: "utility",
    tier: 1,
    cost: 350,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 0,
      power: -5,
      accuracy: 8,
      firepower: 0,
      weight: 3,
    },
    description:
      "Fire-control package. Every weapon on the frame hits more often.",
  },
  {
    id: "utility-auxiliary-generator",
    name: "Auxiliary Generator",
    slot: "utility",
    tier: 1,
    cost: 400,
    stats: {
      armor: 0,
      mobility: 0,
      heat: 2,
      power: 10,
      accuracy: 0,
      firepower: 0,
      weight: 6,
    },
    description:
      "A second, smaller reactor. Buys headroom for one more hungry weapon.",
  },
  ...ADVANCED_PARTS,
];
