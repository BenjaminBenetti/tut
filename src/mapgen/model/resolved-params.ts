import type { BiomeDefinition } from "./biome-definition";
import type { HookRequirement, MapArchetype } from "./map-recipe";
import type { SettlementDefinition } from "./settlement-definition";

// ===========================================
// Resolved parameters
// ===========================================

/**
 * `MapGenParams` with presets expanded and ids looked up (ADR 0004 §7.2).
 * Passes read this; they never see raw ids or preset names.
 */
export interface ResolvedMapGenParams {
  readonly archetype: MapArchetype;
  readonly width: number;
  readonly depth: number;
  readonly biome: BiomeDefinition;
  readonly settlement: SettlementDefinition;
  readonly hooks: readonly HookRequirement[];
}
