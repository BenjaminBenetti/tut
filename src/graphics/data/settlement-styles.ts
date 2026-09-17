import type { SettlementStyleCatalogue } from "../model/settlement-style";

// ===========================================
// Region → style
// ===========================================

/**
 * The architectural family each of the seventeen regions of
 * `overworld/data/earth-map.ts` draws its settlements in (#1155).
 * Neighbouring regions with a shared look share a family:
 *
 * ```
 *   north-american   NA west, NA east, boreal NA
 *   european         Western Europe, Mediterranean, Arctic North Atlantic
 *   slavic           Eastern Europe, North Asia
 *   latin-american   Latin America, Amazon Basin, Andes and Pacific
 *   one region each  Middle East, Sub-Saharan Africa, South Asia,
 *                    East Asia, Southeast Asia, Oceania
 * ```
 */
export const SETTLEMENT_STYLES: SettlementStyleCatalogue = {
  byRegion: {
    "north-america-west": "north-american",
    "north-america-east": "north-american",
    "boreal-north-america": "north-american",
    "western-europe": "european",
    "mediterranean-basin": "european",
    "arctic-north-atlantic": "european",
    "eastern-europe": "slavic",
    "north-asia": "slavic",
    "middle-east": "middle-eastern",
    "sub-saharan-africa": "african",
    "south-asia": "south-asian",
    "east-asia": "east-asian",
    "southeast-asia": "southeast-asian",
    "latin-america": "latin-american",
    "amazon-basin": "latin-american",
    "andes-pacific": "latin-american",
    oceania: "oceanian",
  },
  fallback: "north-american",
};
