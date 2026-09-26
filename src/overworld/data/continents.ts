import type { ContinentCatalogue } from "../model/continent";

// ===========================================
// Continents
// ===========================================

/**
 * The Earth map's seventeen regions grouped into six continents, the
 * "continent-scale regions" the three Great Hives are revealed on
 * (campaign arc §6.9). Every region of `EARTH_MAP` belongs to exactly
 * one; `continents.test.ts` holds that.
 *
 * ```
 *   north-america        NA West, NA East, Boreal North America
 *   south-america        Latin America, Amazon Basin, Andes and Pacific
 *   europe               Western Europe, Eastern Europe, Mediterranean
 *                        Basin, Arctic North Atlantic
 *   africa-middle-east   Middle East, Sub-Saharan Africa
 *   asia                 South Asia, North Asia, East Asia, Southeast Asia
 *   oceania              Oceania
 * ```
 */
export const CONTINENTS: ContinentCatalogue = {
  "north-america": {
    id: "north-america",
    name: "North America",
    regionIds: [
      "north-america-west",
      "north-america-east",
      "boreal-north-america",
    ],
  },
  "south-america": {
    id: "south-america",
    name: "South America",
    regionIds: ["latin-america", "amazon-basin", "andes-pacific"],
  },
  europe: {
    id: "europe",
    name: "Europe",
    regionIds: [
      "western-europe",
      "eastern-europe",
      "arctic-north-atlantic",
      "mediterranean-basin",
    ],
  },
  "africa-middle-east": {
    id: "africa-middle-east",
    name: "Africa and the Middle East",
    regionIds: ["middle-east", "sub-saharan-africa"],
  },
  asia: {
    id: "asia",
    name: "Asia",
    regionIds: ["south-asia", "north-asia", "east-asia", "southeast-asia"],
  },
  oceania: {
    id: "oceania",
    name: "Oceania",
    regionIds: ["oceania"],
  },
};
