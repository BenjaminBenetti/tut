import type { MapLayout } from "./map-layout";
import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/**
 * Id of a city. Plain string, like every id in the codebase (ADR 0003).
 * Seed cities use stable slugs such as `"new-york"`; anything created at
 * runtime would draw from core's `IdGenerator`.
 */
export type CityId = string;

// ===========================================
// Infestation bounds
// ===========================================

/** Lowest infestation a city can have: bug-free. */
export const MIN_INFESTATION = 0;

/** Highest infestation a city can have: overrun (GDD §5.1). */
export const MAX_INFESTATION = 100;

// ===========================================
// City
// ===========================================

/**
 * A major city: the node the infestation lives in and spreads between
 * (GDD §5.1). Plain serializable data; the growth and spread services
 * return copies rather than mutating it.
 */
export interface City {
  readonly id: CityId;
  /** Display name. Geographic flavour only; cities are not factions (GDD §9). */
  readonly name: string;
  /** The one region this city belongs to. */
  readonly regionId: RegionId;
  /** Integer in `[MIN_INFESTATION, MAX_INFESTATION]`. */
  readonly infestation: number;
  /** Cities the infestation can spread to. Adjacency is symmetric. */
  readonly neighbourIds: readonly CityId[];
  /** Where the overworld screen draws it. */
  readonly layout: MapLayout;
}
