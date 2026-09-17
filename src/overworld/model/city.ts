import type { SettlementScale } from "../../content/model/settlement-scale";
import type { BiomeId } from "../../content/model/biome-id";
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
  /**
   * Whether the player has found the infestation here (GDD §5.3). A
   * clean city is never detected; an infested one stays undetected — its
   * infestation hidden and no missions offered — until the region's
   * mean or its own infestation crosses the detection thresholds in
   * `infestation-tuning`, lowered by a sensor array. The opening landings
   * of a new campaign start detected. Invariant: `infestation === 0`
   * implies `detected === false`.
   */
  readonly detected: boolean;
  /** How built-up the city is; missions here generate maps at this scale (GDD §7). */
  readonly scale: SettlementScale;
  /** Local environment for missions; absent cities inherit the region biome. */
  readonly biome?: BiomeId;
  /**
   * People living there, approximately (#1154): `37_000_000` for Tokyo.
   * Flavour for the city's info wheel; the simulation does not read it.
   */
  readonly population: number;
  /** Cities the infestation can spread to. Adjacency is symmetric. */
  readonly neighbourIds: readonly CityId[];
  /** Where the overworld screen draws it. */
  readonly layout: MapLayout;
}

/** Clamps a value into `[MIN_INFESTATION, MAX_INFESTATION]`. */
export function clampInfestation(value: number): number {
  return Math.min(MAX_INFESTATION, Math.max(MIN_INFESTATION, value));
}

/**
 * A copy of `city` at infestation `to`, keeping the detection invariant
 * (GDD §5.3): a city cleared to zero is forgotten, and a clean city that
 * becomes infested starts undetected, so a fresh landing is never shown
 * just because the city was known before. Every service that moves a
 * city's infestation goes through here. Returns `city` itself when
 * nothing would change.
 *
 * ```
 *   to === 0                    ──► detected: false   (cleared, forgotten)
 *   from === 0 and to > 0       ──► detected: false   (fresh landing, unseen)
 *   otherwise                   ──► detected unchanged
 * ```
 */
export function withInfestation(city: City, to: number): City {
  const detected =
    to === MIN_INFESTATION || city.infestation === MIN_INFESTATION
      ? false
      : city.detected;
  if (to === city.infestation && detected === city.detected) {
    return city;
  }
  return { ...city, infestation: to, detected };
}
