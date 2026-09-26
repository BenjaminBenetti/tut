import type { InstallationSite } from "../model/installation-site";
import type { InstallationSiteId } from "../model/installation-site-id";

// ===========================================
// Installation sites (#1175)
// ===========================================
//
// One identity per Earth installation (GDD §5.6). Mapgen registers the
// corresponding composed compound under the same id. Counts are mission
// tuning: the sensor has two generators, the bank and battery three, and
// the dispersal plant four spread through its service lanes.
//
// The story's facilities (campaign arc §6.9) borrow a compound each, so
// their generator counts are that compound's:
//
//   tracking-array  Uplink         the sensor array's yard: the radar on
//                                  its roof is the tracking dish      2
//   launch-site     Launch Window  the dispersal plant's yard: the
//                                  hardstand is the pad, the tanks its
//                                  fuel farm, the towers its gantries 4

/** Every installation site keyed by the facility it stands for. */
export const INSTALLATION_SITES: Readonly<
  Record<InstallationSiteId, InstallationSite>
> = {
  "sensor-array": {
    id: "sensor-array",
    name: "Sensor array",
    generators: 2,
    compound: "sensor-array",
  },
  "repellent-dispersal": {
    id: "repellent-dispersal",
    name: "Repellent dispersal",
    generators: 4,
    compound: "repellent-dispersal",
  },
  "defensive-battery": {
    id: "defensive-battery",
    name: "Defensive battery",
    generators: 3,
    compound: "defensive-battery",
  },
  bank: {
    id: "bank",
    name: "Bank",
    generators: 3,
    compound: "bank",
  },
  "tracking-array": {
    id: "tracking-array",
    name: "Tracking array",
    generators: 2,
    compound: "sensor-array",
  },
  "launch-site": {
    id: "launch-site",
    name: "Launch site",
    generators: 4,
    compound: "repellent-dispersal",
  },
};
