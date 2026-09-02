import type { BiomeId } from "../../content/model/biome-id";
import type { CityId } from "./city";
import type { MapLayout } from "./map-layout";
import type { RegionId } from "./region";

// ===========================================
// Seeds
// ===========================================

/**
 * Authoring form of a city. `regionId` comes from the enclosing
 * `RegionSeed` and `neighbourIds` from the spec's links, so neither can
 * disagree with the rest of the data.
 */
export interface CitySeed {
  readonly id: CityId;
  readonly name: string;
  readonly layout: MapLayout;
  /** Starting infestation; defaults to `MIN_INFESTATION`. */
  readonly infestation?: number;
}

/** Authoring form of a region: its cities are nested rather than referenced. */
export interface RegionSeed {
  readonly id: RegionId;
  readonly name: string;
  readonly biome: BiomeId;
  readonly cities: readonly CitySeed[];
  /** Label position; defaults to the centroid of the region's cities. */
  readonly layout?: MapLayout;
}

// ===========================================
// Links
// ===========================================

/**
 * An undirected spread route between two cities. Written once; the
 * builder adds each end to the other's `neighbourIds`.
 */
export type CityLink = readonly [CityId, CityId];

// ===========================================
// Spec
// ===========================================

/**
 * Everything needed to build an `EarthMap`, in the shape a human writes:
 * regions with nested cities, plus a flat list of links.
 */
export interface EarthMapSpec {
  readonly regions: readonly RegionSeed[];
  readonly links: readonly CityLink[];
}
