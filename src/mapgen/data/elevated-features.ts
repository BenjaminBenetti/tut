import { SurfaceIds } from "./surfaces";
import type { ElevatedFeature } from "../model/elevated-feature";

// ===========================================
// Elevated features (#512)
// ===========================================

/**
 * Legacy artificial features, with dimensions in columns. Road-bearing
 * stamps were disabled by #785, paved plinths by #910, and the remaining
 * soil/grass/rock plinths by #936. City height comes from buildings and
 * actual terrain; planting belongs at the surrounding ground grade.
 *
 * Definitions retain their planning weights and footprints. Per-family
 * caps withdraw their realisation without redistributing those attempts
 * into replacement blocks. Natural terrain is generated independently.
 */
export const ELEVATED_FEATURES: readonly ElevatedFeature[] = [
  {
    // Not placed since #785: the elevation pass skips every feature whose
    // surface is road. Kept as the shape an M3 overpass would start from.
    id: "viaduct",
    shape: "viaduct",
    surface: SurfaceIds.ROAD,
    length: { min: 12, max: 24 },
    breadth: { min: 1, max: 1 },
    weight: 8,
    scales: ["city"],
  },
  {
    id: "podium",
    shape: "plaza",
    surface: SurfaceIds.SIDEWALK,
    length: { min: 6, max: 11 },
    breadth: { min: 6, max: 9 },
    weight: 3,
    scales: ["city"],
    // #910/#936: keep the planning draws; withdrawn plots become open
    // ground instead of feeding more placements of another family.
    maxPerMap: 0,
  },
  {
    id: "plaza",
    shape: "plaza",
    surface: SurfaceIds.SIDEWALK,
    length: { min: 5, max: 8 },
    breadth: { min: 4, max: 7 },
    weight: 4,
    scales: ["city"],
    maxPerMap: 0,
  },
  {
    // Not placed since #785: the elevation pass skips every feature whose
    // surface is road. Kept as the shape an M3 overpass would start from.
    id: "causeway",
    shape: "strip",
    surface: SurfaceIds.ROAD,
    length: { min: 10, max: 18 },
    breadth: { min: 2, max: 3 },
    weight: 3,
    scales: ["city"],
  },
  {
    id: "rail-embankment",
    shape: "strip",
    surface: SurfaceIds.ROCK,
    length: { min: 12, max: 22 },
    breadth: { min: 2, max: 2 },
    weight: 2,
    scales: ["city"],
    maxPerMap: 0,
  },
  {
    id: "terrace",
    shape: "strip",
    surface: SurfaceIds.DIRT,
    length: { min: 6, max: 12 },
    breadth: { min: 3, max: 4 },
    weight: 2,
    scales: ["city", "town"],
    maxPerMap: 0,
  },
  {
    id: "raised-park",
    shape: "plaza",
    surface: SurfaceIds.GRASS,
    length: { min: 5, max: 9 },
    breadth: { min: 4, max: 7 },
    weight: 3,
    scales: ["city"],
    maxPerMap: 0,
  },
  {
    id: "rubble-mound",
    shape: "mound",
    surface: SurfaceIds.ROCK,
    length: { min: 4, max: 6 },
    breadth: { min: 4, max: 6 },
    weight: 2,
    scales: ["city", "town"],
    maxPerMap: 0,
  },
];
