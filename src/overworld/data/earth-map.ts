import type { BiomeId } from "../../content/model/biome-id";
import type { SettlementScale } from "../../content/model/settlement-scale";
import type { EarthMap } from "../model/earth-map";
import type {
  CityLink,
  CitySeed,
  EarthMapSpec,
  RegionSeed,
} from "../model/earth-map-spec";
import { buildEarthMap } from "../service/earth-map-builder";
import { projectEquirectangular } from "../service/map-projection";

// ===========================================
// Authoring helpers
// ===========================================

/**
 * Declares a city at a real-world latitude / longitude (degrees). Scale
 * defaults to `"city"`; the sparser sites are declared `"town"` so map
 * generation gets exercised at more than one settlement scale.
 */
function city(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  options: { readonly scale?: SettlementScale; readonly biome?: BiomeId } = {},
): CitySeed {
  return {
    id,
    name,
    layout: projectEquirectangular(latitude, longitude),
    ...options,
  };
}

/** Declares an undirected spread route between two cities. */
function link(a: string, b: string): CityLink {
  return [a, b];
}

// ===========================================
// Regions and cities
// ===========================================

/**
 * The first playable Earth (GDD §5.1). Regions are geographic areas, never
 * nations (GDD §9); every shipped biome appears at least once so map
 * generation gets exercised across the campaign. Cities are placed by
 * their real coordinates; the overworld screen may nudge labels.
 *
 * Region defaults describe the broader landscape; local city biomes keep
 * mountain capitals, river deltas and dry interiors distinct. Northern,
 * Amazonian, Andean and Mediterranean routes fill the original map's gaps.
 */
const REGIONS: readonly RegionSeed[] = [
  {
    id: "north-america-west",
    name: "North America West",
    biome: "coastal",
    cities: [
      city("vancouver", "Vancouver", 49.28, -123.12, { biome: "temperate" }),
      city("san-francisco", "San Francisco", 37.77, -122.42, {
        biome: "mediterranean",
      }),
      city("los-angeles", "Los Angeles", 34.05, -118.24, {
        biome: "mediterranean",
      }),
    ],
  },
  {
    id: "north-america-east",
    name: "North America East",
    biome: "temperate",
    cities: [
      city("toronto", "Toronto", 43.65, -79.38),
      city("chicago", "Chicago", 41.88, -87.63),
      city("new-york", "New York", 40.71, -74.01),
    ],
  },
  {
    id: "latin-america",
    name: "Latin America",
    biome: "temperate",
    cities: [
      city("mexico-city", "Mexico City", 19.43, -99.13, { biome: "alpine" }),
      city("bogota", "Bogotá", 4.71, -74.07, { biome: "alpine" }),
      city("sao-paulo", "São Paulo", -23.55, -46.63, { biome: "tropical" }),
      city("buenos-aires", "Buenos Aires", -34.6, -58.38, { biome: "steppe" }),
    ],
  },
  {
    id: "western-europe",
    name: "Western Europe",
    biome: "temperate",
    cities: [
      city("london", "London", 51.51, -0.13),
      city("paris", "Paris", 48.86, 2.35),
      city("berlin", "Berlin", 52.52, 13.4),
    ],
  },
  {
    id: "eastern-europe",
    name: "Eastern Europe",
    biome: "temperate",
    cities: [
      city("stockholm", "Stockholm", 59.33, 18.07, { biome: "taiga" }),
      city("warsaw", "Warsaw", 52.23, 21.01),
      city("moscow", "Moscow", 55.76, 37.62),
    ],
  },
  {
    id: "middle-east",
    name: "Middle East",
    biome: "desert",
    cities: [
      city("istanbul", "Istanbul", 41.01, 28.98, { biome: "mediterranean" }),
      city("cairo", "Cairo", 30.04, 31.24),
      city("tehran", "Tehran", 35.69, 51.39, { biome: "steppe" }),
    ],
  },
  {
    id: "sub-saharan-africa",
    name: "Sub-Saharan Africa",
    biome: "savanna",
    cities: [
      city("lagos", "Lagos", 6.52, 3.38, { biome: "tropical" }),
      city("nairobi", "Nairobi", -1.29, 36.82),
      city("johannesburg", "Johannesburg", -26.2, 28.05),
    ],
  },
  {
    id: "south-asia",
    name: "South Asia",
    biome: "savanna",
    cities: [
      city("karachi", "Karachi", 24.86, 67.01, { biome: "desert" }),
      city("delhi", "Delhi", 28.61, 77.21),
      city("mumbai", "Mumbai", 19.08, 72.88, { biome: "tropical" }),
    ],
  },
  {
    id: "north-asia",
    name: "North Asia",
    biome: "steppe",
    cities: [
      city("novosibirsk", "Novosibirsk", 55.03, 82.92, {
        scale: "town",
        biome: "taiga",
      }),
      city("almaty", "Almaty", 43.24, 76.89, {
        scale: "town",
        biome: "alpine",
      }),
      city("ulaanbaatar", "Ulaanbaatar", 47.89, 106.91, { scale: "town" }),
    ],
  },
  {
    id: "east-asia",
    name: "East Asia",
    biome: "temperate",
    cities: [
      city("beijing", "Beijing", 39.9, 116.4),
      city("seoul", "Seoul", 37.57, 126.98),
      city("tokyo", "Tokyo", 35.68, 139.69),
    ],
  },
  {
    id: "southeast-asia",
    name: "Southeast Asia",
    biome: "wetland",
    cities: [
      city("bangkok", "Bangkok", 13.76, 100.5),
      city("singapore", "Singapore", 1.35, 103.82, { biome: "tropical" }),
      city("jakarta", "Jakarta", -6.21, 106.85, { biome: "tropical" }),
    ],
  },
  {
    id: "oceania",
    name: "Oceania",
    biome: "coastal",
    cities: [
      city("alice-springs", "Alice Springs", -23.7, 133.88, {
        scale: "town",
        biome: "desert",
      }),
      city("perth", "Perth", -31.95, 115.86, { scale: "town" }),
      city("sydney", "Sydney", -33.87, 151.21),
      city("auckland", "Auckland", -36.85, 174.76, { scale: "town" }),
    ],
  },
  {
    id: "boreal-north-america",
    name: "Boreal North America",
    biome: "taiga",
    cities: [
      city("anchorage", "Anchorage", 61.22, -149.9, { scale: "town" }),
      city("yellowknife", "Yellowknife", 62.45, -114.38, { scale: "town" }),
    ],
  },
  {
    id: "arctic-north-atlantic",
    name: "Arctic North Atlantic",
    biome: "tundra",
    cities: [
      city("reykjavik", "Reykjavík", 64.15, -21.94, { scale: "town" }),
      city("tromso", "Tromsø", 69.65, 18.96, { scale: "town" }),
      city("longyearbyen", "Longyearbyen", 78.22, 15.65, {
        scale: "rural",
        biome: "snowy",
      }),
    ],
  },
  {
    id: "amazon-basin",
    name: "Amazon Basin",
    biome: "tropical",
    cities: [
      city("manaus", "Manaus", -3.12, -60.02),
      city("iquitos", "Iquitos", -3.75, -73.25, { biome: "wetland" }),
    ],
  },
  {
    id: "andes-pacific",
    name: "Andes and Pacific",
    biome: "alpine",
    cities: [
      city("quito", "Quito", -0.18, -78.47),
      city("lima", "Lima", -12.05, -77.04, { biome: "desert" }),
      city("santiago", "Santiago", -33.45, -70.67, { biome: "mediterranean" }),
    ],
  },
  {
    id: "mediterranean-basin",
    name: "Mediterranean Basin",
    biome: "mediterranean",
    cities: [
      city("lisbon", "Lisbon", 38.72, -9.14),
      city("rome", "Rome", 41.9, 12.5),
      city("athens", "Athens", 37.98, 23.73),
    ],
  },
];

// ===========================================
// Spread routes
// ===========================================

/**
 * Undirected city↔city links. Within a region every city is reachable;
 * cross-region links give the infestation a way around the world in both
 * directions so no region is a dead end.
 */
const LINKS: readonly CityLink[] = [
  // ---- Northern forests and the Arctic ----
  link("anchorage", "yellowknife"),
  link("anchorage", "vancouver"),
  link("yellowknife", "toronto"),
  link("reykjavik", "tromso"),
  link("tromso", "longyearbyen"),
  link("reykjavik", "new-york"),
  link("reykjavik", "london"),
  link("tromso", "stockholm"),
  // ---- South American interior and Pacific ----
  link("manaus", "iquitos"),
  link("manaus", "bogota"),
  link("iquitos", "sao-paulo"),
  link("quito", "lima"),
  link("lima", "santiago"),
  link("quito", "bogota"),
  link("santiago", "buenos-aires"),
  // ---- Mediterranean and Australian interior ----
  link("lisbon", "rome"),
  link("rome", "athens"),
  link("lisbon", "paris"),
  link("rome", "cairo"),
  link("athens", "istanbul"),
  link("alice-springs", "perth"),
  link("alice-springs", "sydney"),

  // ---- North America West ----
  link("vancouver", "san-francisco"),
  link("san-francisco", "los-angeles"),
  // ---- North America East ----
  link("toronto", "chicago"),
  link("toronto", "new-york"),
  link("chicago", "new-york"),
  // ---- Latin America ----
  link("mexico-city", "bogota"),
  link("bogota", "sao-paulo"),
  link("sao-paulo", "buenos-aires"),
  // ---- Western Europe ----
  link("london", "paris"),
  link("paris", "berlin"),
  // ---- Eastern Europe ----
  link("stockholm", "warsaw"),
  link("warsaw", "moscow"),
  link("stockholm", "moscow"),
  // ---- Middle East ----
  link("istanbul", "cairo"),
  link("istanbul", "tehran"),
  // ---- Sub-Saharan Africa ----
  link("lagos", "nairobi"),
  link("nairobi", "johannesburg"),
  link("lagos", "johannesburg"),
  // ---- South Asia ----
  link("karachi", "delhi"),
  link("karachi", "mumbai"),
  link("delhi", "mumbai"),
  // ---- North Asia ----
  link("novosibirsk", "almaty"),
  link("novosibirsk", "ulaanbaatar"),
  // ---- East Asia ----
  link("beijing", "seoul"),
  link("seoul", "tokyo"),
  // ---- Southeast Asia ----
  link("bangkok", "singapore"),
  link("singapore", "jakarta"),
  // ---- Oceania ----
  link("perth", "sydney"),
  link("sydney", "auckland"),

  // ---- Cross-region: the Americas ----
  link("vancouver", "toronto"),
  link("los-angeles", "chicago"),
  link("los-angeles", "mexico-city"),
  link("chicago", "mexico-city"),
  // ---- Cross-region: the Atlantic ----
  link("new-york", "london"),
  link("sao-paulo", "lagos"),
  link("london", "lagos"),
  // ---- Cross-region: Europe and the Middle East ----
  link("london", "stockholm"),
  link("berlin", "warsaw"),
  link("berlin", "istanbul"),
  link("moscow", "tehran"),
  link("cairo", "nairobi"),
  // ---- Cross-region: Asia ----
  link("moscow", "novosibirsk"),
  link("tehran", "karachi"),
  link("tehran", "almaty"),
  link("mumbai", "nairobi"),
  link("delhi", "bangkok"),
  link("ulaanbaatar", "beijing"),
  link("beijing", "bangkok"),
  // ---- Cross-region: the Pacific ----
  link("jakarta", "perth"),
  link("tokyo", "sydney"),
  link("san-francisco", "tokyo"),
];

// ===========================================
// Map
// ===========================================

/** The authoring spec the shipped map is built from. */
const EARTH_MAP_SPEC: EarthMapSpec = { regions: REGIONS, links: LINKS };

/** The shipped strategic map: 17 regions, 51 cities, 73 spread routes. */
export const EARTH_MAP: EarthMap = buildEarthMap(EARTH_MAP_SPEC);
