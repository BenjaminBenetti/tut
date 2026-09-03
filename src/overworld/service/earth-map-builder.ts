import type { SettlementScale } from "../../content/model/settlement-scale";
import type { City, CityId } from "../model/city";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type {
  CityLink,
  CitySeed,
  EarthMapSpec,
  RegionSeed,
} from "../model/earth-map-spec";
import type { MapLayout } from "../model/map-layout";
import type { Region, RegionId } from "../model/region";

// ===========================================
// Constants
// ===========================================

/** Scale a city seed gets when it declares none: the shipped Earth is a map of major cities. */
export const DEFAULT_CITY_SCALE: SettlementScale = "city";

// ===========================================
// Types
// ===========================================

/** Which region each city belongs to. */
type RegionOfCity = ReadonlyMap<CityId, RegionId>;

/** Each city's neighbours, in the order their links were declared. */
type Neighbours = ReadonlyMap<CityId, readonly CityId[]>;

// ===========================================
// Build
// ===========================================

/**
 * Builds a complete `EarthMap` from a declarative spec. Each link is
 * written once and expanded into both cities' `neighbourIds`; `regionId`,
 * `cityIds`, `neighbourRegionIds` and default region label positions are
 * derived, so the seed data cannot drift out of symmetry.
 *
 * ```
 *   EarthMapSpec                        EarthMap
 *   ├── regions[]                  ──►  ├── regions[]  + cityIds
 *   │     └── cities[]                  │              + neighbourRegionIds
 *   │                                   │              + layout (centroid)
 *   └── links[]  [a, b]            ──►  └── cities[]   + regionId
 *                                                      + neighbourIds (both ways)
 *                                                      + infestation
 * ```
 *
 * Throws on structural errors: a duplicate id, an empty region, a link
 * naming an unknown city, a self link, a repeated link, or an infestation
 * outside `[MIN_INFESTATION, MAX_INFESTATION]`. Graph-level properties
 * such as connectivity are the seed data's responsibility and are covered
 * by its tests.
 */
export function buildEarthMap(spec: EarthMapSpec): EarthMap {
  const regionOfCity = indexRegions(spec.regions);
  const neighbours = indexLinks(spec.links, regionOfCity);
  const regions = spec.regions.map((seed) =>
    buildRegion(seed, neighbours, regionOfCity),
  );
  const cities = spec.regions.flatMap((seed) =>
    seed.cities.map((city) => buildCity(city, seed.id, neighbours)),
  );
  return { regions, cities };
}

// ===========================================
// Indexing
// ===========================================

/** Maps every city to its region, rejecting duplicate ids and empty regions. */
function indexRegions(regions: readonly RegionSeed[]): RegionOfCity {
  const regionIds = new Set<RegionId>();
  const regionOfCity = new Map<CityId, RegionId>();
  for (const region of regions) {
    if (regionIds.has(region.id)) {
      throw new Error(`Duplicate region id "${region.id}"`);
    }
    regionIds.add(region.id);
    if (region.cities.length === 0) {
      throw new Error(`Region "${region.id}" has no cities`);
    }
    for (const city of region.cities) {
      if (regionOfCity.has(city.id)) {
        throw new Error(`Duplicate city id "${city.id}"`);
      }
      regionOfCity.set(city.id, region.id);
    }
  }
  return regionOfCity;
}

/** Expands each undirected link into both cities' neighbour lists. */
function indexLinks(
  links: readonly CityLink[],
  regionOfCity: RegionOfCity,
): Neighbours {
  const neighbours = new Map<CityId, CityId[]>();
  for (const id of regionOfCity.keys()) {
    neighbours.set(id, []);
  }
  for (const [a, b] of links) {
    if (a === b) {
      throw new Error(`City "${a}" is linked to itself`);
    }
    const aNeighbours = neighbours.get(a);
    const bNeighbours = neighbours.get(b);
    if (aNeighbours === undefined) {
      throw new Error(`Link names unknown city "${a}"`);
    }
    if (bNeighbours === undefined) {
      throw new Error(`Link names unknown city "${b}"`);
    }
    if (aNeighbours.includes(b)) {
      throw new Error(`Link "${a}" ↔ "${b}" is declared twice`);
    }
    aNeighbours.push(b);
    bNeighbours.push(a);
  }
  return neighbours;
}

// ===========================================
// Assembly
// ===========================================

/** Assembles a `City`, validating its starting infestation. */
function buildCity(
  seed: CitySeed,
  regionId: RegionId,
  neighbours: Neighbours,
): City {
  const infestation = seed.infestation ?? MIN_INFESTATION;
  const inRange =
    Number.isInteger(infestation) &&
    infestation >= MIN_INFESTATION &&
    infestation <= MAX_INFESTATION;
  if (!inRange) {
    throw new Error(
      `City "${seed.id}" infestation ${infestation} is not an integer in [${MIN_INFESTATION}, ${MAX_INFESTATION}]`,
    );
  }
  return {
    id: seed.id,
    name: seed.name,
    regionId,
    infestation,
    scale: seed.scale ?? DEFAULT_CITY_SCALE,
    neighbourIds: neighbours.get(seed.id) ?? [],
    layout: seed.layout,
  };
}

/** Assembles a `Region`, deriving its region adjacency from its cities' links. */
function buildRegion(
  seed: RegionSeed,
  neighbours: Neighbours,
  regionOfCity: RegionOfCity,
): Region {
  const cityIds = seed.cities.map((city) => city.id);
  const neighbourRegionIds: RegionId[] = [];
  for (const cityId of cityIds) {
    for (const neighbourId of neighbours.get(cityId) ?? []) {
      const otherRegion = regionOfCity.get(neighbourId);
      if (
        otherRegion !== undefined &&
        otherRegion !== seed.id &&
        !neighbourRegionIds.includes(otherRegion)
      ) {
        neighbourRegionIds.push(otherRegion);
      }
    }
  }
  return {
    id: seed.id,
    name: seed.name,
    biome: seed.biome,
    cityIds,
    neighbourRegionIds,
    layout: seed.layout ?? centroid(seed.cities.map((city) => city.layout)),
  };
}

/** Mean of a non-empty list of layout positions. */
function centroid(points: readonly MapLayout[]): MapLayout {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}
