import { BIOME_DEFINITIONS } from "../data/biomes";
import { BUILDING_TEMPLATES } from "../data/building-templates";
import { ELEVATED_FEATURES } from "../data/elevated-features";
import { MAP_SIZE_DEFINITIONS } from "../data/map-sizes";
import { PROP_DEFINITIONS } from "../data/props";
import { ROOM_FURNISHING } from "../data/room-furnishing";
import { SETTLEMENT_DEFINITIONS } from "../data/settlements";
import { SURFACE_DEFINITIONS } from "../data/surfaces";
import { DEFAULT_HOOK_PLACERS } from "../generator/placer/default-hook-placers";
import type { MapGenRegistries } from "../model/registries";
import { createRegistry } from "../../core/service/definition-registry";

// ===========================================
// Default registries
// ===========================================

/**
 * Builds the registries over the shipped data in `mapgen/data`. The game
 * calls this once; tests build their own registries with narrower data
 * when they need to.
 */
export function createDefaultRegistries(): MapGenRegistries {
  return {
    surfaces: createRegistry("surface", SURFACE_DEFINITIONS),
    props: createRegistry("prop", PROP_DEFINITIONS),
    biomes: createRegistry("biome", Object.values(BIOME_DEFINITIONS)),
    settlements: createRegistry(
      "settlement",
      Object.values(SETTLEMENT_DEFINITIONS),
    ),
    mapSizes: createRegistry("map size", Object.values(MAP_SIZE_DEFINITIONS)),
    buildingTemplates: createRegistry(
      "building template",
      Object.values(BUILDING_TEMPLATES),
    ),
    elevatedFeatures: createRegistry("elevated feature", ELEVATED_FEATURES),
    roomFurnishing: createRegistry(
      "room furnishing",
      Object.values(ROOM_FURNISHING),
    ),
    hookPlacers: createRegistry("hook placer", DEFAULT_HOOK_PLACERS),
  };
}
