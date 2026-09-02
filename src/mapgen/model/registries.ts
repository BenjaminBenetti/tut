import type { BiomeDefinition } from "./biome-definition";
import type { MapSizeDefinition } from "./map-size-definition";
import type { PropDefinition } from "./prop";
import type { Registry } from "./registry";
import type { SettlementDefinition } from "./settlement-definition";
import type { SurfaceDefinition } from "./surface";

// ===========================================
// Registries
// ===========================================

/**
 * Every data registry generation reads (ADR 0004 §7.4). Injected into the
 * pipeline so tests can swap definitions and so a new biome or prop is a
 * data change only. Later issues add building templates and hook placers.
 */
export interface MapGenRegistries {
  readonly surfaces: Registry<SurfaceDefinition>;
  readonly props: Registry<PropDefinition>;
  readonly biomes: Registry<BiomeDefinition>;
  readonly settlements: Registry<SettlementDefinition>;
  readonly mapSizes: Registry<MapSizeDefinition>;
}
