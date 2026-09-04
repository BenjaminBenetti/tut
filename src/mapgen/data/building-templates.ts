import type { BuildingTemplate } from "../model/building-template";
import type { KnownBuildingKindId } from "./building-kind-ids";

// ===========================================
// Building templates
// ===========================================

/**
 * The four M1.5 building kinds, keyed by id so a kind id without a
 * template fails to compile. Numbers are starting points; tune them in
 * the preview harness, not in the pass.
 *
 * `windowDensity` is rolled per wall segment, and a segment is 2 m × 3 m,
 * so a window is a floor-to-ceiling pane the width of a room: at 0.5–0.7
 * every façade read as a curtain wall (#492). Domestic and retail sit at
 * 0.3 — a window on most rooms, brick carrying the rest — the tower keeps
 * 0.6 so a glass tower still means something, and the warehouse stays
 * blind. Windows are also the only way to shoot into a building, since
 * solid walls and doors stop the line, so the number is a gameplay knob
 * as well as an art one: at 0.3 about 4 % of indoor egg spawners have no
 * firing position a mech can reach, against 3 % at the old values and
 * 9 % at 0.2. Infantry is never locked out — it walks inside.
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
    windowDensity: 0.3,
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
    windowDensity: 0.3,
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
  apartment: {
    id: "apartment",
    footprintWidth: { min: 3, max: 6 },
    footprintDepth: { min: 3, max: 6 },
    floors: { min: 3, max: 4 },
    roof: "flat",
    roofWalkable: true,
    windowDensity: 0.3,
    scales: ["town", "city"],
    minRoomSize: 2,
  },
  tower: {
    id: "tower",
    footprintWidth: { min: 3, max: 5 },
    footprintDepth: { min: 3, max: 5 },
    floors: { min: 3, max: 5 },
    roof: "flat",
    roofWalkable: true,
    windowDensity: 0.6,
    scales: ["town", "city"],
    minRoomSize: 2,
  },
};
