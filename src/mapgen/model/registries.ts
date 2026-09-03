import type { BiomeDefinition } from "./biome-definition";
import type { BuildingTemplate } from "./building-template";
import type { HookPlacer } from "./hook-placer";
import type { MapSizeDefinition } from "./map-size-definition";
import type { PropDefinition } from "./prop";
import type { Registry } from "./registry";
import type { RoomFurnishing } from "./room-furnishing";
import type { SettlementDefinition } from "./settlement-definition";
import type { SurfaceDefinition } from "./surface";

// ===========================================
// Registries
// ===========================================

/**
 * Every data registry generation reads (ADR 0004 §7.4). Injected into the
 * pipeline so tests can swap definitions and so a new biome or prop is a
 * data change only.
 */
export interface MapGenRegistries {
  readonly surfaces: Registry<SurfaceDefinition>;
  readonly props: Registry<PropDefinition>;
  readonly biomes: Registry<BiomeDefinition>;
  readonly settlements: Registry<SettlementDefinition>;
  readonly mapSizes: Registry<MapSizeDefinition>;
  readonly buildingTemplates: Registry<BuildingTemplate>;
  /** Interior props per room kind, keyed by the kind id. */
  readonly roomFurnishing: Registry<RoomFurnishing>;
  readonly hookPlacers: Registry<HookPlacer>;
}
