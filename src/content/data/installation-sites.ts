import type { DeployableTypeId } from "../model/deployable-type-id";
import type { InstallationSite } from "../model/installation-site";

// ===========================================
// Installation sites (#1175)
// ===========================================
//
// One site per Earth installation (GDD §5.6). The building kinds name
// templates in `mapgen/data/building-templates.ts`, one per type so the
// landmark reads as the thing the player built. Generator counts are the
// first tuning: the sensor array is a small station with two, the bank
// and the battery are heavier plants with three, the dispersal has four
// pumps spread wide so the line has to stretch. Every generator is an
// objective, so more generators is more to hold, not more to lose.

/** Every installation site keyed by the installation it stands for. */
export const INSTALLATION_SITES: Readonly<
  Record<DeployableTypeId, InstallationSite>
> = {
  "sensor-array": {
    id: "sensor-array",
    name: "Sensor array",
    buildingKind: "sensor-array",
    generators: 2,
  },
  "repellent-dispersal": {
    id: "repellent-dispersal",
    name: "Repellent dispersal",
    buildingKind: "repellent-dispersal",
    generators: 4,
  },
  "defensive-battery": {
    id: "defensive-battery",
    name: "Defensive battery",
    buildingKind: "defensive-battery",
    generators: 3,
  },
  bank: {
    id: "bank",
    name: "Bank",
    buildingKind: "bank",
    generators: 3,
  },
};
