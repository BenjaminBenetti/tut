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
 */
export const STARTER_PARTS: readonly MechPart[] = [
  // ===========================================
  // Chassis
  // ===========================================
  {
    id: "chassis-vanguard",
    name: "Vanguard",
    slot: "chassis",
    tier: 1,
    cost: 1200,
    stats: {
      armor: 20,
      mobility: 5,
      heat: -2,
      power: 30,
      accuracy: 0,
      firepower: 0,
      weight: 20,
    },
    capacity: { maxWeight: 40, powerOutput: 30, utilitySlots: 2 },
    description:
      "Light frame built for speed. Carries little, but gets there first.",
  },
  {
    id: "chassis-bulwark",
    name: "Bulwark",
    slot: "chassis",
    tier: 1,
    cost: 1800,
    stats: {
      armor: 40,
      mobility: 3,
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
    name: "Atlas",
    slot: "chassis",
    tier: 2,
    cost: 3200,
    stats: {
      armor: 55,
      mobility: 4,
      heat: -4,
      power: 60,
      accuracy: 0,
      firepower: 0,
      weight: 45,
    },
    capacity: { maxWeight: 95, powerOutput: 60, utilitySlots: 4 },
    description:
      "Capital-class frame with a reactor to match. Losing one is a bad day.",
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
    weapon: { range: 10, armorPen: 2 },
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
    weapon: { range: 3, armorPen: 0 },
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
    weapon: { range: 12, armorPen: 1 },
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
    weapon: { range: 14, armorPen: 1 },
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
    weapon: { range: 16, armorPen: 0 },
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
    weapon: { range: 8, armorPen: 3 },
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
];
