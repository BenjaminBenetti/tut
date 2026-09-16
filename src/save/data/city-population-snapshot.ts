import type { CityId } from "../../overworld/model/city";

// ===========================================
// Frozen v24 populations
// ===========================================

/**
 * The shipped cities' populations as they were when `population` joined
 * `City` (#1154, schema v24). Never edit: a save from before v24 must
 * gain the same figures whatever the content data says later, so the
 * migration reads this table rather than `EARTH_MAP`.
 */
// prettier-ignore
export const CITY_POPULATION_SNAPSHOT: Readonly<Record<CityId, number>> = {
  "vancouver": 2_600_000,
  "san-francisco": 4_700_000,
  "los-angeles": 12_900_000,
  "toronto": 6_400_000,
  "chicago": 9_400_000,
  "new-york": 19_500_000,
  "mexico-city": 21_800_000,
  "bogota": 10_700_000,
  "sao-paulo": 22_600_000,
  "buenos-aires": 15_600_000,
  "london": 9_700_000,
  "paris": 12_300_000,
  "berlin": 3_800_000,
  "stockholm": 2_400_000,
  "warsaw": 3_100_000,
  "moscow": 12_700_000,
  "istanbul": 15_900_000,
  "cairo": 22_200_000,
  "tehran": 9_400_000,
  "lagos": 16_600_000,
  "nairobi": 5_500_000,
  "johannesburg": 6_300_000,
  "karachi": 17_600_000,
  "delhi": 32_900_000,
  "mumbai": 21_300_000,
  "novosibirsk": 1_600_000,
  "almaty": 2_100_000,
  "ulaanbaatar": 1_600_000,
  "beijing": 21_900_000,
  "seoul": 26_000_000,
  "tokyo": 37_000_000,
  "bangkok": 11_000_000,
  "singapore": 6_000_000,
  "jakarta": 34_500_000,
  "alice-springs": 26_000,
  "perth": 2_200_000,
  "sydney": 5_400_000,
  "auckland": 1_700_000,
  "anchorage": 400_000,
  "yellowknife": 20_000,
  "reykjavik": 250_000,
  "tromso": 78_000,
  "longyearbyen": 2_500,
  "manaus": 2_300_000,
  "iquitos": 480_000,
  "quito": 2_900_000,
  "lima": 11_200_000,
  "santiago": 7_100_000,
  "lisbon": 2_900_000,
  "rome": 4_300_000,
  "athens": 3_600_000,
};
