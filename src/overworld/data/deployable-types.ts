import type {
  DeployableType,
  DeployableTypeId,
} from "../model/deployable-type";

// ===========================================
// Deployable types (GDD §5.6)
// ===========================================
//
// M1 placeholder tuning for the three starter installations. Rules of
// thumb:
//
//   • Credits are sized against `economy/data/economy-tuning` (starting
//     bankroll 5000, full stipend 500 per day): a build costs two to
//     three days of income and upkeep eats a few percent of it.
//   • Suppression is in infestation points per day, against a base
//     growth of 3 (`overworld/data/infestation-tuning`) that doubles at
//     maximum threat. A full battery complement (2 × 2) holds a city at
//     zero threat but only slows it at maximum threat.
//   • Caps keep one region from becoming a fortress: stacking every
//     installation to the cap costs more than a starting bankroll.

/**
 * The three M1 deployable types, keyed by id so the compiler fails when a
 * `DeployableTypeId` has no definition. Pure data: the tick and command
 * services interpret `effect` generically.
 */
export const DEPLOYABLE_TYPES: Readonly<
  Record<DeployableTypeId, DeployableType>
> = {
  "defensive-battery": {
    id: "defensive-battery",
    name: "Defensive battery",
    buildCost: 1500,
    upkeepPerDay: 50,
    maxPerRegion: 2,
    effect: { suppression: 2 },
    description:
      "Automated gun emplacements around the region's cities. Thins crawlers as they surface, slowing infestation growth in every city of the region.",
  },

  "repellent-dispersal": {
    id: "repellent-dispersal",
    name: "Repellent dispersal",
    buildCost: 1000,
    upkeepPerDay: 30,
    maxPerRegion: 1,
    effect: { spreadDeterrence: 0.5 },
    description:
      "Aerosol towers seeding the region's borders with a pheromone the bugs avoid. Halves the chance of infestation spreading to neighbouring regions.",
  },

  "sensor-array": {
    id: "sensor-array",
    name: "Sensor array",
    buildCost: 800,
    upkeepPerDay: 20,
    maxPerRegion: 1,
    effect: { intelBonus: 2 },
    description:
      "Seismic and thermal pickets across the region. Missions in its cities are detected two days earlier, leaving more time to respond.",
  },
};
