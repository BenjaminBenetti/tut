import type {
  DeployableType,
  DeployableTypeId,
} from "../model/deployable-type";

// ===========================================
// Deployable types (GDD §5.6)
// ===========================================
//
// Tuning for the four installations and their three levels. Rules of
// thumb:
//
//   • Credits are sized against `economy/data/economy-tuning` (starting
//     bankroll 5000, full stipend 500 per day): a build costs two to
//     three days of income, an upgrade a little more than the level
//     before it, and upkeep eats a few percent of the stipend.
//   • Each level should be worth its upgrade: the effect grows faster
//     than the upkeep does.
//   • Detection factors scale the thresholds in
//     `overworld/data/infestation-tuning` (city 30, region mean 15): at
//     level 3 a seeded city (5) is found the day it lands (30 × 0.2 = 6,
//     one day of growth).
//   • Growth factors multiply `baseGrowthRate` 3: level 3 holds a city to
//     one point a day at zero threat.
//   • The bank pays for itself in about ten days at every level
//     (level 1: 1200 for 150 − 30 = 120 net per day).
//   • Every type is capped at one per region, so the level is the axis
//     the player scales an installation on.

/**
 * The four deployable types, keyed by id so the compiler fails when a
 * `DeployableTypeId` has no definition. Pure data: the tick and command
 * services interpret each level's `effect` generically.
 */
export const DEPLOYABLE_TYPES: Readonly<
  Record<DeployableTypeId, DeployableType>
> = {
  "sensor-array": {
    id: "sensor-array",
    name: "Sensor array",
    maxPerRegion: 1,
    levels: {
      1: {
        buildCost: 800,
        upkeepPerDay: 20,
        effect: { detectionFactor: 0.6, intelBonus: 1 },
      },
      2: {
        buildCost: 1000,
        upkeepPerDay: 35,
        effect: { detectionFactor: 0.4, intelBonus: 2 },
      },
      3: {
        buildCost: 1400,
        upkeepPerDay: 50,
        effect: { detectionFactor: 0.2, intelBonus: 3 },
      },
    },
    description:
      "Seismic and thermal pickets across the region. Finds an infested city well before its region builds up, and keeps its missions on offer longer.",
  },

  "repellent-dispersal": {
    id: "repellent-dispersal",
    name: "Repellent dispersal",
    maxPerRegion: 1,
    levels: {
      1: {
        buildCost: 1000,
        upkeepPerDay: 30,
        effect: { growthFactor: 0.75, spreadDeterrence: 0.25 },
      },
      2: {
        buildCost: 1300,
        upkeepPerDay: 50,
        effect: { growthFactor: 0.55, spreadDeterrence: 0.4 },
      },
      3: {
        buildCost: 1800,
        upkeepPerDay: 75,
        effect: { growthFactor: 0.35, spreadDeterrence: 0.6 },
      },
    },
    description:
      "Aerosol towers seeding the region with a pheromone the bugs avoid. Slows infestation growth in every city of the region and makes fresh landings there rarer.",
  },

  "defensive-battery": {
    id: "defensive-battery",
    name: "Defensive battery",
    maxPerRegion: 1,
    levels: {
      1: {
        buildCost: 1500,
        upkeepPerDay: 50,
        effect: { garrisonTurrets: 1 },
      },
      2: {
        buildCost: 1500,
        upkeepPerDay: 80,
        effect: { garrisonTurrets: 2 },
      },
      3: {
        buildCost: 2000,
        upkeepPerDay: 120,
        effect: { garrisonTurrets: 3 },
      },
    },
    description:
      "Automated gun emplacements around the region's cities. Every mission fought in the region starts with garrison turrets already on the ground, working like an engineer's but never running down.",
  },

  bank: {
    id: "bank",
    name: "Bank",
    maxPerRegion: 1,
    levels: {
      1: {
        buildCost: 1200,
        upkeepPerDay: 30,
        effect: { incomeBonus: 150 },
      },
      2: {
        buildCost: 1500,
        upkeepPerDay: 60,
        effect: { incomeBonus: 350 },
      },
      3: {
        buildCost: 2000,
        upkeepPerDay: 100,
        effect: { incomeBonus: 600 },
      },
    },
    description:
      "A TDF reserve bank underwriting the region's reconstruction. Adds a fixed sum to the daily stipend, whatever state Earth is in.",
  },
};
