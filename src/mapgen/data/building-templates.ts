import type { BuildingTemplate } from "../model/building-template";
import type { KnownBuildingKindId } from "./building-kind-ids";

// ===========================================
// Building templates
// ===========================================

/**
 * The four M1.5 building kinds, keyed by id so a kind id without a
 * template fails to compile. Numbers are starting points; tune them in
 * the preview harness, not in the pass.
 */
export const BUILDING_TEMPLATES: Readonly<
  Record<KnownBuildingKindId, BuildingTemplate>
> = {
  house: {
    id: "house",
    footprintWidth: { min: 3, max: 5 },
    footprintDepth: { min: 3, max: 5 },
    floors: { min: 1, max: 2 },
    roof: "pitched",
    roofWalkable: false,
    windowDensity: 0.5,
    scales: ["rural", "town", "city"],
    minRoomSize: 2,
  },
  shop: {
    id: "shop",
    footprintWidth: { min: 4, max: 6 },
    footprintDepth: { min: 3, max: 5 },
    floors: { min: 1, max: 2 },
    roof: "flat",
    roofWalkable: true,
    windowDensity: 0.6,
    scales: ["town", "city"],
    minRoomSize: 3,
  },
  warehouse: {
    id: "warehouse",
    footprintWidth: { min: 5, max: 8 },
    footprintDepth: { min: 5, max: 8 },
    floors: { min: 1, max: 1 },
    roof: "flat",
    roofWalkable: true,
    windowDensity: 0.15,
    scales: ["rural", "town", "city"],
    minRoomSize: 4,
  },
  tower: {
    id: "tower",
    footprintWidth: { min: 3, max: 5 },
    footprintDepth: { min: 3, max: 5 },
    floors: { min: 3, max: 5 },
    roof: "flat",
    roofWalkable: true,
    windowDensity: 0.7,
    scales: ["town", "city"],
    minRoomSize: 2,
  },
};
