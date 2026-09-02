import type { BiomeId } from "../../content/model/biome-id";
import type { BiomeDefinition } from "../model/biome-definition";
import { BuildingKindIds } from "./building-kind-ids";
import { PropKindIds } from "./props";
import { SurfaceIds } from "./surfaces";

// ===========================================
// Biome definitions
// ===========================================

/**
 * The four M1.5 biomes (GDD §7), keyed by id so the compiler fails when a
 * biome id has no definition. Numbers are conservative starting points;
 * tune them in the preview harness, not in passes.
 */
export const BIOME_DEFINITIONS: Readonly<Record<BiomeId, BiomeDefinition>> = {
  temperate: {
    id: "temperate",
    groundSurfaces: [
      { surface: SurfaceIds.GRASS, weight: 8 },
      { surface: SurfaceIds.DIRT, weight: 2 },
    ],
    terrain: {
      amplitudeLevels: 2,
      frequency: 0.08,
      octaves: 2,
      roughness: 0.5,
    },
    hasShoreline: false,
    vegetation: [
      { prop: PropKindIds.TREE_OAK, density: 4 },
      { prop: PropKindIds.TREE_PINE, density: 2 },
      { prop: PropKindIds.BOULDER, density: 0.5 },
      { prop: PropKindIds.FENCE, density: 1 },
    ],
    buildingKinds: [
      { template: BuildingKindIds.HOUSE, weight: 5 },
      { template: BuildingKindIds.SHOP, weight: 2 },
      { template: BuildingKindIds.WAREHOUSE, weight: 1 },
      { template: BuildingKindIds.TOWER, weight: 1 },
    ],
    roadSurface: SurfaceIds.ROAD,
    trailSurface: SurfaceIds.DIRT,
  },
  snowy: {
    id: "snowy",
    groundSurfaces: [
      { surface: SurfaceIds.SNOW, weight: 8.5 },
      { surface: SurfaceIds.ROCK, weight: 1.5 },
    ],
    terrain: {
      amplitudeLevels: 3,
      frequency: 0.07,
      octaves: 2,
      roughness: 0.55,
    },
    hasShoreline: false,
    vegetation: [
      { prop: PropKindIds.TREE_PINE, density: 5 },
      { prop: PropKindIds.BOULDER, density: 1 },
    ],
    buildingKinds: [
      { template: BuildingKindIds.HOUSE, weight: 5 },
      { template: BuildingKindIds.WAREHOUSE, weight: 2 },
      { template: BuildingKindIds.SHOP, weight: 1 },
    ],
    roadSurface: SurfaceIds.ROAD,
    trailSurface: SurfaceIds.SNOW,
  },
  desert: {
    id: "desert",
    groundSurfaces: [
      { surface: SurfaceIds.SAND, weight: 8 },
      { surface: SurfaceIds.ROCK, weight: 2 },
    ],
    terrain: {
      amplitudeLevels: 2,
      frequency: 0.06,
      octaves: 2,
      roughness: 0.45,
    },
    hasShoreline: false,
    vegetation: [
      { prop: PropKindIds.CACTUS, density: 3 },
      { prop: PropKindIds.BOULDER, density: 1.5 },
      { prop: PropKindIds.TREE_PALM, density: 0.5 },
    ],
    buildingKinds: [
      { template: BuildingKindIds.HOUSE, weight: 4 },
      { template: BuildingKindIds.WAREHOUSE, weight: 2 },
      { template: BuildingKindIds.SHOP, weight: 2 },
      { template: BuildingKindIds.TOWER, weight: 1 },
    ],
    roadSurface: SurfaceIds.ROAD,
    trailSurface: SurfaceIds.SAND,
  },
  coastal: {
    id: "coastal",
    groundSurfaces: [
      { surface: SurfaceIds.GRASS, weight: 5 },
      { surface: SurfaceIds.SAND, weight: 3.5 },
      { surface: SurfaceIds.DIRT, weight: 1.5 },
    ],
    terrain: {
      amplitudeLevels: 1,
      frequency: 0.07,
      octaves: 2,
      roughness: 0.5,
    },
    hasShoreline: true,
    vegetation: [
      { prop: PropKindIds.TREE_PALM, density: 3 },
      { prop: PropKindIds.TREE_OAK, density: 1 },
      { prop: PropKindIds.BOULDER, density: 1 },
    ],
    buildingKinds: [
      { template: BuildingKindIds.HOUSE, weight: 5 },
      { template: BuildingKindIds.SHOP, weight: 3 },
      { template: BuildingKindIds.WAREHOUSE, weight: 2 },
    ],
    roadSurface: SurfaceIds.ROAD,
    trailSurface: SurfaceIds.DIRT,
  },
};
