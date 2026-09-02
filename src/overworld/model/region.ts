import type { BiomeId } from "../../content/model/biome-id";
import type { CityId } from "./city";
import type { MapLayout } from "./map-layout";

// ===========================================
// Ids
// ===========================================

/**
 * Branded id of a region. Seed regions use stable slugs such as
 * `"western-europe"`. Create one with {@link regionId}.
 */
export type RegionId = string & { readonly __brand: "RegionId" };

/** Brands a raw string as a `RegionId`. No validation: ids are static data. */
export function regionId(raw: string): RegionId {
  return raw as RegionId;
}

// ===========================================
// Region
// ===========================================

/**
 * A slice of Earth holding one or more cities (GDD §5.1). Regions carry
 * the biome missions in them generate with, aggregate their cities'
 * infestation (#50) and host deployables (GDD §5.6).
 */
export interface Region {
  readonly id: RegionId;
  /** Display name. A geographic area, never a nation (GDD §9). */
  readonly name: string;
  /** Biome every mission in this region generates its map with. */
  readonly biome: BiomeId;
  /** Cities in this region, in display order. Each city has exactly one region. */
  readonly cityIds: readonly CityId[];
  /** Regions that share at least one city↔city link with this one. Symmetric. */
  readonly neighbourRegionIds: readonly RegionId[];
  /** Where the overworld screen draws the region label. */
  readonly layout: MapLayout;
}
