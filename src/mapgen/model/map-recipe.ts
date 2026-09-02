import type { HookKind, HookMeta } from "./hook";
import type { PassMask } from "./pass-mask";

// ===========================================
// Parameters
// ===========================================

/** Biome identifier, resolved through the biome registry (`mapgen/data/biomes`). */
export type BiomeId = string;

/** How built-up the map is. Drives roads, lots, building count and height. */
export type SettlementScale = "rural" | "town" | "city";

/** Every settlement scale, sparsest first. */
export const SETTLEMENT_SCALES: readonly SettlementScale[] = [
  "rural",
  "town",
  "city",
];

/**
 * Which pass list generates the map. M1.5 ships `settlement`; hives, crash
 * sites and the space platform are later archetypes (ADR 0004 §7.3).
 */
export type MapArchetype = "settlement";

/** Named map sizes, resolved through `mapgen/data/map-sizes`. */
export type MapSizePreset = "small" | "medium" | "large";

/** Every size preset, smallest first. */
export const MAP_SIZE_PRESETS: readonly MapSizePreset[] = [
  "small",
  "medium",
  "large",
];

/** Explicit horizontal size in tiles. */
export interface MapDimensions {
  readonly width: number;
  readonly depth: number;
}

/** A preset name or explicit dimensions. */
export type MapSize = MapSizePreset | MapDimensions;

/**
 * What a mission type asks the generator to place. The hook pass resolves
 * `kind` to a placer; invariant I8 checks the result.
 */
export interface HookRequirement {
  readonly kind: HookKind;
  /** Exact number of hooks of this kind the placer must emit. */
  readonly count: number;
  /** Classes that must be able to reach each hook. */
  readonly requiredPass: PassMask;
  /** Minimum manhattan distance from any deploy zone tile. */
  readonly minDistanceFromDeploy?: number;
  readonly meta?: HookMeta;
}

/** Everything except the seed that shapes a map. */
export interface MapGenParams {
  readonly archetype: MapArchetype;
  readonly biome: BiomeId;
  readonly settlement: SettlementScale;
  readonly size: MapSize;
  /** From the mission type definition. */
  readonly hooks: readonly HookRequirement[];
}

/**
 * What a save stores instead of the map (ADR 0004 §4.7). Generating from
 * the same recipe yields a deep-equal `TacticalMap`.
 */
export interface MapRecipe {
  /** Free text; hashed to the RNG's numeric seed by core's `hashSeed`. */
  readonly seed: string;
  readonly params: MapGenParams;
}

/**
 * Returns true when the size is a preset name rather than explicit
 * dimensions.
 */
export function isMapSizePreset(size: MapSize): size is MapSizePreset {
  return typeof size === "string";
}
