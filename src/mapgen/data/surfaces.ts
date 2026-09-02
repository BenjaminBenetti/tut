import { PassMask } from "../model/pass-mask";
import type { SurfaceDefinition } from "../model/surface";

// ===========================================
// Surface ids
// ===========================================

/** Well-known surface ids (ADR 0004 §4.2). Biomes may add more in data. */
export const SurfaceIds = {
  GRASS: "grass",
  DIRT: "dirt",
  SAND: "sand",
  SNOW: "snow",
  ROCK: "rock",
  ROAD: "road",
  SIDEWALK: "sidewalk",
  WATER: "water",
  FLOOR: "floor",
  ROOF: "roof",
  STAIRS: "stairs",
} as const;

/** One of the well-known surface ids. */
export type KnownSurfaceId = (typeof SurfaceIds)[keyof typeof SurfaceIds];

// ===========================================
// Definitions
// ===========================================

/**
 * Surface definitions. Ground surfaces admit every class; interiors and
 * roofs are infantry-only; water admits nobody.
 */
export const SURFACE_DEFINITIONS: readonly SurfaceDefinition[] = [
  { id: SurfaceIds.GRASS, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.DIRT, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.SAND, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.SNOW, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.ROCK, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.ROAD, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.SIDEWALK, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.WATER, defaultPass: PassMask.NONE, isInterior: false },
  { id: SurfaceIds.FLOOR, defaultPass: PassMask.INFANTRY, isInterior: true },
  { id: SurfaceIds.ROOF, defaultPass: PassMask.INFANTRY, isInterior: false },
  { id: SurfaceIds.STAIRS, defaultPass: PassMask.INFANTRY, isInterior: true },
];
