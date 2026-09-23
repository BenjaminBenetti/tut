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
  /** Validated whole infestation band, defaulting to zero. */
  readonly infestation: number;
  readonly archetype: MapArchetype;
  readonly width: number;
  readonly depth: number;
  readonly biome: BiomeDefinition;
  readonly settlement: SettlementDefinition;
  readonly hooks: readonly HookRequirement[];
  /** Building kind the map must contain, validated against the templates (#1175). */
  readonly landmark?: string;
  /** Registered authored site, reserved before ordinary settlement lots. */
  readonly site?: string;
  /** Natural-edge slope share, 0–1, defaulted (#799). */
  readonly slopeShare: number;
}
