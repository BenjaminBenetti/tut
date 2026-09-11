import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { PlaceProfile } from "../model/place-profile";
import { PropKindIds } from "./props";
import { SurfaceIds } from "./surfaces";

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
  perth: {
    id: "perth",
    environment: {
      // Coastal heath and remnant woodland around built plots. Retain
      // the coastal shoreline, relief, streets and building distribution.
      groundSurfaces: [
        { surface: SurfaceIds.GRASS, weight: 4.5 },
        { surface: SurfaceIds.SAND, weight: 4.5 },
        { surface: SurfaceIds.DIRT, weight: 1 },
      ],
      vegetation: [
        {
          prop: PropKindIds.TREE_TUART,
          density: 1.4,
          cluster: { min: 2, max: 3 },
        },
        { prop: PropKindIds.BANKSIA, density: 2, cluster: { min: 2, max: 4 } },
        {
          prop: PropKindIds.GRASS_TREE,
          density: 1.2,
          cluster: { min: 2, max: 4 },
        },
        {
          prop: PropKindIds.LIMESTONE_OUTCROP,
          density: 0.4,
          cluster: { min: 2, max: 3 },
        },
        { prop: PropKindIds.TREE_PALM, density: 0.2 },
        { prop: PropKindIds.FENCE, density: 0.8 },
      ],
    },
  },
  johannesburg: { id: "johannesburg", environment: {} },
};
