import type { Applied } from "../../core/model/domain-event";
import type { City, CityId } from "../model/city";
import { clampInfestation, MIN_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import type { CityInfestationChangedEvent } from "../model/overworld-domain-event";
import { CITY_INFESTATION_CHANGED } from "../model/overworld-domain-event";
import { MAX_THREAT, MIN_THREAT } from "../model/threat";
import { findCity } from "./earth-map-query-service";

// ===========================================
// Types
// ===========================================

/**
 * Infestation points removed from each city's growth this day, keyed by
 * city id. Produced by the deployable effects tick (#66); a city with no
 * entry has no suppression. Values are finite and non-negative.
 */
export type CitySuppression = Readonly<Record<CityId, number>>;

// ===========================================
// Formula
// ===========================================

/**
 * Signed infestation change for one infested city on one day, before
 * rounding and clamping (GDD §5.3):
 *
 * ```
 *   growth = baseGrowthRate × (1 + threatFactor × threat / 100) − suppression
 * ```
 *
 * Negative when suppression outweighs growth, so deployables can push a
 * city back towards zero.
 */
export function growthDelta(
  threat: number,
  suppression: number,
  tuning: InfestationTuning,
): number {
  const threatScale = 1 + (tuning.threatFactor * threat) / MAX_THREAT;
  return tuning.baseGrowthRate * threatScale - suppression;
}

// ===========================================
// Tick step
// ===========================================

/**
 * Advances every infested city by one day of growth. Cities at zero are
 * dormant and untouched: bringing the infestation to a new city is
 * seeding (#58), not growth. Each changed city is rebuilt with its new
 * integer infestation and described by a `CityInfestationChanged` event;
 * unchanged cities keep their identity. The input map is never mutated.
 *
 * ```
 *   for each city:  infested?  ──no──► unchanged
 *                      │yes
 *                      ▼
 *      to = clamp(round(from + growthDelta(threat, suppression[id])), 0, 100)
 *                      │
 *          to ≠ from ──┴──► City' + CityInfestationChanged { cityId, from, to }
 * ```
 *
 * @throws {RangeError} if `threat` is outside `[MIN_THREAT, MAX_THREAT]`,
 *   if a suppression value is negative or not finite, or if a suppression
 *   key names a city that is not on the map. These are programmer errors
 *   in the calling tick, not game states.
 */
export function applyGrowth(
  map: EarthMap,
  threat: number,
  suppression: CitySuppression,
  tuning: InfestationTuning,
): Applied<EarthMap, CityInfestationChangedEvent> {
  assertThreat(threat);
  assertSuppression(map, suppression);

  const events: CityInfestationChangedEvent[] = [];
  const cities = map.cities.map((city): City => {
    if (city.infestation === MIN_INFESTATION) {
      return city;
    }
    const delta = growthDelta(threat, suppression[city.id] ?? 0, tuning);
    const to = clampInfestation(Math.round(city.infestation + delta));
    if (to === city.infestation) {
      return city;
    }
    events.push({
      type: CITY_INFESTATION_CHANGED,
      payload: { cityId: city.id, from: city.infestation, to },
    });
    return { ...city, infestation: to };
  });

  return { state: { regions: map.regions, cities }, events };
}

// ===========================================
// Validation
// ===========================================

/** Rejects a threat outside the range `computeThreat` produces. */
function assertThreat(threat: number): void {
  if (!Number.isFinite(threat) || threat < MIN_THREAT || threat > MAX_THREAT) {
    throw new RangeError(
      `Invalid threat ${String(threat)}: must be a finite number in [${MIN_THREAT}, ${MAX_THREAT}]`,
    );
  }
}

/** Rejects suppression entries with bad values or for cities not on the map. */
function assertSuppression(map: EarthMap, suppression: CitySuppression): void {
  for (const [cityId, value] of Object.entries(suppression)) {
    if (findCity(map, cityId) === undefined) {
      throw new RangeError(
        `Suppression names unknown city "${cityId}"; keys must be city ids`,
      );
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `Invalid suppression ${String(value)} for city "${cityId}": must be a finite non-negative number`,
      );
    }
  }
}
