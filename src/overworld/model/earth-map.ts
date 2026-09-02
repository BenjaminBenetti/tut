import type { City } from "./city";
import type { Region } from "./region";

// ===========================================
// Earth map
// ===========================================

/**
 * The strategic map: regions, the cities inside them, and the spread
 * routes between cities (GDD §5.1). Plain serializable data.
 *
 * ```
 *   EarthMap
 *   ├── regions[]   Region ── cityIds ──► City
 *   │                  └── neighbourRegionIds ──► Region
 *   └── cities[]    City ── regionId ──► Region
 *                      └── neighbourIds ──► City  (symmetric)
 * ```
 *
 * Invariants (enforced by `buildEarthMap` and the seed-data tests): ids
 * are unique, every city is in exactly one region, every region has at
 * least one city, adjacency is symmetric, and the city graph is connected.
 */
export interface EarthMap {
  readonly regions: readonly Region[];
  readonly cities: readonly City[];
}
