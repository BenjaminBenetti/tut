import type { DeployableTypeId } from "../model/deployable-type-id";
import type { InstallationSite } from "../model/installation-site";

// ===========================================
// Installation sites (#1175)
// ===========================================
//
// One identity per Earth installation (GDD §5.6). Mapgen registers the
// corresponding composed compound under the same id. Counts are mission
// tuning: the sensor has two generators, the bank and battery three, and
// the dispersal plant four spread through its service lanes.

/** Every installation site keyed by the installation it stands for. */
export const INSTALLATION_SITES: Readonly<
  Record<DeployableTypeId, InstallationSite>
> = {
  "sensor-array": {
    id: "sensor-array",
    name: "Sensor array",
    generators: 2,
  },
  "repellent-dispersal": {
    id: "repellent-dispersal",
    name: "Repellent dispersal",
    generators: 4,
  },
  "defensive-battery": {
    id: "defensive-battery",
    name: "Defensive battery",
    generators: 3,
  },
  bank: {
    id: "bank",
    name: "Bank",
    generators: 3,
  },
};
