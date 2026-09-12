import { isRecord } from "../../core/model/record-guard";
import { WORLD_BIOMES_SNAPSHOT } from "../data/world-biomes-snapshot";
import type { Migration } from "../model/migration";

// ===========================================
// Frozen v18 → v19 world expansion
// ===========================================

/** Original regions, used to distinguish a shipped campaign from a custom map. */
const ORIGINAL_REGIONS = WORLD_BIOMES_SNAPSHOT.regions.slice(0, 12);

/**
 * Updates the shipped Earth while retaining city progress, custom additions,
 * pending mission recipes and the frozen map of any mission in flight.
 * Custom maps inherit optional city biomes without receiving unrelated nodes.
 */
export const EXPAND_WORLD_BIOMES: Migration = {
  from: 18,
  to: 19,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) return state;
    const map = state.overworld.map;
    if (
      !isRecord(map) ||
      !Array.isArray(map.cities) ||
      !Array.isArray(map.regions)
    )
      return state;
    const cities = recordsById(map.cities);
    const regions = recordsById(map.regions);
    // Alice Springs is the only new city nested in an original region.
    const originalCityIds = ORIGINAL_REGIONS.flatMap((r) => r.cityIds).filter(
      (id) => id !== "alice-springs",
    );
    if (
      !ORIGINAL_REGIONS.every((r) => regions.has(r.id)) ||
      !originalCityIds.every((id) => {
        const city = cities.get(id);
        const seed = WORLD_BIOMES_SNAPSHOT.cities.find((c) => c.id === id);
        return city?.regionId === seed?.regionId;
      })
    )
      return state;

    for (const seed of WORLD_BIOMES_SNAPSHOT.cities) {
      const existing = cities.get(seed.id);
      cities.set(
        seed.id,
        existing === undefined
          ? { ...seed }
          : {
              ...existing,
              ...(seed.biome === undefined ? {} : { biome: seed.biome }),
              neighbourIds: joinedIds(existing.neighbourIds, seed.neighbourIds),
            },
      );
    }
    for (const seed of WORLD_BIOMES_SNAPSHOT.regions) {
      const existing = regions.get(seed.id);
      regions.set(
        seed.id,
        existing === undefined
          ? { ...seed }
          : {
              ...existing,
              biome: seed.biome,
              cityIds: joinedIds(existing.cityIds, seed.cityIds),
              neighbourRegionIds: joinedIds(
                existing.neighbourRegionIds,
                seed.neighbourRegionIds,
              ),
            },
      );
    }
    return {
      ...state,
      overworld: {
        ...state.overworld,
        map: {
          ...map,
          cities: [...cities.values()],
          regions: [...regions.values()],
        },
      },
    };
  },
};

/** Validates saved map entries before indexing them in their original order. */
function recordsById(
  values: readonly unknown[],
): Map<string, Record<string, unknown>> {
  const entries = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      entries.has(value.id)
    )
      throw new Error("v18 world contains an invalid or duplicate map entry");
    entries.set(value.id, value);
  }
  return entries;
}

/** Adds the expansion's links without removing any existing custom routes. */
function joinedIds(
  existing: unknown,
  added: readonly string[],
): readonly string[] {
  if (
    !Array.isArray(existing) ||
    !existing.every((id): id is string => typeof id === "string")
  )
    throw new Error("v18 world contains invalid map links");
  return [...new Set([...existing, ...added])];
}
