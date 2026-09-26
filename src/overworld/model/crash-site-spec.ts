import type { CityId } from "./city";

// ===========================================
// Crash site spec
// ===========================================

/**
 * The landing a Crash Site offer carries (campaign arc §6.3, ADR 0013
 * §2.2): every crash site starts a fresh infestation seed at a city, and
 * the offer remembers where and what the city held before, so the
 * consequence rule can erase exactly that landing on a win.
 *
 * ```
 *   offer made   ──► landingCityId + landing seed        (the director, through onOffered)
 *   won          ──► landingCityId back to preLandingInfestation,
 *                    or left lower if it has fallen since
 *   lost/lapsed  ──► landingCityId + the offer's ignorePenalty (the landing takes root)
 * ```
 *
 * Frozen when the offer is made; plain serializable data. Optional on
 * `Mission`, so no save needs a migration.
 */
export interface CrashSiteSpec {
  /** The city the pod came down beside; the offer's own city. */
  readonly landingCityId: CityId;
  /** That city's infestation the moment before the landing. */
  readonly preLandingInfestation: number;
}
