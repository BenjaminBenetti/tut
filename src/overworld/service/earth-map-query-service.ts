import type { City, CityId } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { Region, RegionId } from "../model/region";

// ===========================================
// Collections
// ===========================================

/** Returns every city on the map, in data order. */
export function allCities(map: EarthMap): readonly City[] {
  return map.cities;
}

/** Returns every region on the map, in data order. */
export function allRegions(map: EarthMap): readonly Region[] {
  return map.regions;
}

// ===========================================
// Lookup
// ===========================================

/** Returns the city with the given id, or `undefined` when there is none. */
export function findCity(map: EarthMap, id: CityId): City | undefined {
  return map.cities.find((city) => city.id === id);
}

/**
 * Returns the city with the given id. Throws when there is none: an
 * unknown id is a data or programming error, not a game state, so
 * callers never have to handle it.
 */
export function getCity(map: EarthMap, id: CityId): City {
  const city = findCity(map, id);
  if (city === undefined) {
    throw new Error(`Unknown city "${id}"`);
  }
  return city;
}

/** Returns the region with the given id, or `undefined` when there is none. */
export function findRegion(map: EarthMap, id: RegionId): Region | undefined {
  return map.regions.find((region) => region.id === id);
}

/** Returns the region with the given id. Throws when there is none. */
export function getRegion(map: EarthMap, id: RegionId): Region {
  const region = findRegion(map, id);
  if (region === undefined) {
    throw new Error(`Unknown region "${id}"`);
  }
  return region;
}

// ===========================================
// Relations
// ===========================================

/** Returns the cities in a region, in the region's `cityIds` order. */
export function citiesInRegion(map: EarthMap, regionId: RegionId): City[] {
  return getRegion(map, regionId).cityIds.map((id) => getCity(map, id));
}

/** Returns the cities adjacent to a city, in its `neighbourIds` order. */
export function neighboursOf(map: EarthMap, cityId: CityId): City[] {
  return getCity(map, cityId).neighbourIds.map((id) => getCity(map, id));
}

/** Returns the region a city belongs to. */
export function regionOf(map: EarthMap, cityId: CityId): Region {
  return getRegion(map, getCity(map, cityId).regionId);
}
