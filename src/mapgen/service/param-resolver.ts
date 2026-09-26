import type { MapDimensions, MapGenParams } from "../model/map-recipe";
import { isMapSizePreset, MAP_ARCHETYPES } from "../model/map-recipe";
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
  | "biomes"
  | "settlements"
  | "mapSizes"
  | "placeProfiles"
  | "buildingTemplates"
  | "missionSites"
>;

/**
 * Archetypes the generator can build: every member of the union. The
 * check guards recipes read back from a save, which the compiler never
 * saw.
 */
const SUPPORTED_ARCHETYPES: ReadonlySet<string> = new Set(MAP_ARCHETYPES);

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
  if (
    params.landmark !== undefined &&
    !registries.buildingTemplates.has(params.landmark)
  ) {
    throw new Error(`Unknown landmark building kind "${params.landmark}"`);
  }
  if (params.site !== undefined) {
    const site = registries.missionSites.get(params.site);
    if (
      site.width + 2 * site.margin + 4 > width ||
      site.depth + 2 * site.margin + 4 > depth
    ) {
      throw new Error(`Mission site "${site.id}" does not fit the map`);
    }
    if (params.archetype !== "settlement")
      throw new Error("Mission sites require the settlement pipeline");
  }
  const slopeShare = resolveSlopeShare(params.slopeShare);
  const infestation = params.infestation ?? 0;
  if (!Number.isInteger(infestation) || infestation < 0 || infestation > 10) {
    throw new Error(
      `infestation must be an integer in 0..10, got ${String(infestation)}`,
    );
  }
  return {
    infestation,
    archetype: params.archetype,
    width,
    depth,
    biome:
      params.placeProfile === undefined
        ? biome
        : {
            ...biome,
            ...registries.placeProfiles.get(params.placeProfile).environment,
          },
    settlement,
    hooks: params.hooks,
    ...(params.landmark === undefined ? {} : { landmark: params.landmark }),
    ...(params.site === undefined ? {} : { site: params.site }),
    slopeShare,
  };
}

/** A slope share is a proportion; anything else is a programmer error. */
function resolveSlopeShare(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`slopeShare must be within 0..1, got ${String(value)}`);
  }
  return value;
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
