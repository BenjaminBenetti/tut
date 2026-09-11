import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { PlaceProfile } from "../model/place-profile";
import { PropKindIds } from "./props";

/**
 * Lagos: a built, landward coastal-lowland neighbourhood, not a mandatory
 * waterfront. Lower, longer terrain undulations retain natural relief;
 * building heights, streets, planting density and access rules stay intact.
 * Perth/Johannesburg reserve the shared selection seam for #1083/#1084.
 */
export const PLACE_PROFILES: Readonly<Record<PlaceProfileId, PlaceProfile>> = {
  lagos: {
    id: "lagos",
    environment: {
      terrain: {
        amplitudeLayers: 2,
        frequency: 0.04,
        octaves: 2,
        roughness: 0.5,
      },
      vegetation: [
        {
          prop: PropKindIds.TREE_TROPICAL_ALMOND,
          density: 4,
          cluster: { min: 3, max: 6 },
        },
        {
          prop: PropKindIds.TREE_OIL_PALM,
          density: 2,
          cluster: { min: 3, max: 6 },
        },
        { prop: PropKindIds.BOULDER, density: 0.5 },
        { prop: PropKindIds.FENCE, density: 1 },
      ],
    },
  },
  perth: { id: "perth", environment: {} },
  johannesburg: { id: "johannesburg", environment: {} },
};
