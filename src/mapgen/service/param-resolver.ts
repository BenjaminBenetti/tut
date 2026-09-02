import type { MapDimensions, MapGenParams } from "../model/map-recipe";
import { isMapSizePreset } from "../model/map-recipe";
import {
  MAX_MAP_DIMENSION,
  MIN_MAP_DIMENSION,
} from "../model/map-size-definition";
import type { MapGenRegistries } from "../model/registries";
import type { ResolvedMapGenParams } from "../model/resolved-params";

// ===========================================
// Parameter resolution
// ===========================================

/** The registries parameter resolution needs. */
export type ParamResolverRegistries = Pick<
  MapGenRegistries,
  "biomes" | "settlements" | "mapSizes"
>;

/** Archetypes the generator can build today. */
const SUPPORTED_ARCHETYPES: ReadonlySet<string> = new Set(["settlement"]);

/**
 * Expands presets and looks up ids so passes only ever see concrete
 * numbers and definitions (ADR 0004 §7.2). Fails loudly on anything
 * unknown or out of range; a bad recipe is a bug upstream, never a map.
 */
export function resolveMapGenParams(
  params: MapGenParams,
  registries: ParamResolverRegistries,
): ResolvedMapGenParams {
  if (!SUPPORTED_ARCHETYPES.has(params.archetype)) {
    throw new Error(`Unsupported map archetype "${params.archetype}"`);
  }
  const { width, depth } = resolveDimensions(params, registries);
  const biome = registries.biomes.get(params.biome);
  const settlement = registries.settlements.get(params.settlement);
  validateHooks(params);
  return {
    archetype: params.archetype,
    width,
    depth,
    biome,
    settlement,
    hooks: params.hooks,
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * Turns a preset name or explicit dimensions into validated numbers.
 */
function resolveDimensions(
  params: MapGenParams,
  registries: ParamResolverRegistries,
): MapDimensions {
  const size = params.size;
  const dimensions: MapDimensions = isMapSizePreset(size)
    ? registries.mapSizes.get(size)
    : size;
  validateDimension("width", dimensions.width);
  validateDimension("depth", dimensions.depth);
  return { width: dimensions.width, depth: dimensions.depth };
}

/**
 * Throws unless the value is an integer inside the supported range.
 */
function validateDimension(name: string, value: number): void {
  if (
    !Number.isInteger(value) ||
    value < MIN_MAP_DIMENSION ||
    value > MAX_MAP_DIMENSION
  ) {
    throw new Error(
      `Map ${name} must be an integer in [${MIN_MAP_DIMENSION}, ` +
        `${MAX_MAP_DIMENSION}], got ${value}`,
    );
  }
}

/**
 * Throws on a hook requirement no placer could satisfy.
 */
function validateHooks(params: MapGenParams): void {
  for (const requirement of params.hooks) {
    if (!Number.isInteger(requirement.count) || requirement.count < 0) {
      throw new Error(
        `Hook "${requirement.kind}" count must be a non-negative integer, ` +
          `got ${requirement.count}`,
      );
    }
    const distance = requirement.minDistanceFromDeploy;
    if (
      distance !== undefined &&
      (!Number.isFinite(distance) || distance < 0)
    ) {
      throw new Error(
        `Hook "${requirement.kind}" minDistanceFromDeploy must be ` +
          `non-negative, got ${distance}`,
      );
    }
  }
}
