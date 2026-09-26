import type { Applied } from "../../core/model/domain-event";
import type { City, CityId } from "../model/city";
import { MIN_INFESTATION } from "../model/city";
import type { CityDetectedEvent } from "../model/city-detected-event";
import { CITY_DETECTED } from "../model/city-detected-event";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import type { RegionId } from "../model/region";
import { findRegion } from "./earth-map-query-service";
import { regionInfestation } from "./threat-service";

// ===========================================
// Types
// ===========================================

/**
 * Fraction in `(0, 1]` each region's detection thresholds are scaled by
 * this day, keyed by region id. Produced by the deployable effects tick
 * from sensor arrays; a region with no entry uses the tuning's thresholds
 * as they are.
 */
export type RegionDetectionFactor = Readonly<Record<RegionId, number>>;

/** The two thresholds a region is judged against, after scaling. */
export interface DetectionThresholds {
  /** Region mean at or above which every infested city in it is found. */
  readonly region: number;
  /** City infestation at or above which the city is found on its own. */
  readonly city: number;
}

// ===========================================
// Formula
// ===========================================

/**
 * The detection thresholds for a region whose sensors scale them by
 * `factor` (GDD §5.3, §5.6): both tuning thresholds multiplied by it.
 */
export function detectionThresholds(
  factor: number,
  tuning: InfestationTuning,
): DetectionThresholds {
  return {
    region: tuning.regionDetectionThreshold * factor,
    city: tuning.cityDetectionThreshold * factor,
  };
}

/**
 * Whether an infested city at `infestation` in a region whose mean is
 * `regionMean` is found against `thresholds`: either signal suffices.
 */
export function isDetectable(
  infestation: number,
  regionMean: number,
  thresholds: DetectionThresholds,
): boolean {
  return regionMean >= thresholds.region || infestation >= thresholds.city;
}

// ===========================================
// Tick step
// ===========================================

/**
 * Finds the infested cities the player can now see (GDD §5.3). Runs after
 * growth and spread in the daily tick, so a landing is judged on the day
 * it happens. Each newly detected city is rebuilt with `detected: true`
 * and announced by a `CityDetected` event, in map order; a detected city
 * that has since been cleared to zero is quietly forgotten (the
 * invariant `withInfestation` keeps, restored here for any path that
 * bypassed it). Unchanged cities keep their identity; the input map is
 * never mutated.
 *
 * ```
 *   for each city:
 *     clean and detected      ──► detected: false            (no event)
 *     infested and undetected ──► thresholds = tuning × factor[region]
 *                                 region mean ≥ region threshold
 *                                 or city ≥ city threshold ──► detected: true + CityDetected
 *     otherwise               ──► unchanged
 * ```
 *
 * @throws {RangeError} if a factor is outside `(0, 1]`, not finite, or
 *   names a region that is not on the map: programmer errors in the
 *   calling tick, not game states.
 */
export function applyDetection(
  map: EarthMap,
  factor: RegionDetectionFactor,
  tuning: InfestationTuning,
): Applied<EarthMap, CityDetectedEvent> {
  assertFactor(map, factor);

  const events: CityDetectedEvent[] = [];
  const means = new Map<RegionId, number>();
  const cities = map.cities.map((city): City => {
    if (city.infestation === MIN_INFESTATION) {
      return city.detected ? { ...city, detected: false } : city;
    }
    if (city.detected) {
      return city;
    }
    let mean = means.get(city.regionId);
    if (mean === undefined) {
      mean = regionInfestation(map, city.regionId);
      means.set(city.regionId, mean);
    }
    const thresholds = detectionThresholds(factor[city.regionId] ?? 1, tuning);
    if (!isDetectable(city.infestation, mean, thresholds)) {
      return city;
    }
    events.push({
      type: CITY_DETECTED,
      payload: {
        cityId: city.id,
        regionId: city.regionId,
        infestation: city.infestation,
      },
    });
    return { ...city, detected: true };
  });

  const changed = cities.some((city, index) => city !== map.cities[index]);
  return {
    state: changed ? { regions: map.regions, cities } : map,
    events,
  };
}

// ===========================================
// Witnessed infestations
// ===========================================

/**
 * The map with city `cityId` found because the player saw its
 * infestation arrive (a crash site's landing, arc §6.3), whatever the
 * thresholds say: rebuilt with `detected: true` and announced by a
 * `CityDetected`, as `applyDetection` would. A clean city, one already
 * detected, or one not on the map is left alone, and the map returned
 * as it is.
 *
 * ```
 *   infested ∧ ¬detected ──► detected: true + CityDetected
 *   otherwise            ──► unchanged, no event
 * ```
 */
export function witnessCity(
  map: EarthMap,
  cityId: CityId,
): Applied<EarthMap, CityDetectedEvent> {
  const city = map.cities.find((candidate) => candidate.id === cityId);
  if (
    city === undefined ||
    city.detected ||
    city.infestation === MIN_INFESTATION
  ) {
    return { state: map, events: [] };
  }
  return {
    state: {
      regions: map.regions,
      cities: map.cities.map((candidate) =>
        candidate === city ? { ...city, detected: true } : candidate,
      ),
    },
    events: [
      {
        type: CITY_DETECTED,
        payload: {
          cityId: city.id,
          regionId: city.regionId,
          infestation: city.infestation,
        },
      },
    ],
  };
}

// ===========================================
// Validation
// ===========================================

/** Rejects factors outside `(0, 1]` or for unknown regions. */
function assertFactor(map: EarthMap, factor: RegionDetectionFactor): void {
  for (const [regionId, value] of Object.entries(factor)) {
    if (findRegion(map, regionId) === undefined) {
      throw new RangeError(
        `Detection factor names unknown region "${regionId}"; keys must be region ids`,
      );
    }
    if (!Number.isFinite(value) || value <= 0 || value > 1) {
      throw new RangeError(
        `Invalid detection factor ${String(value)} for region "${regionId}": must be a number in (0, 1]`,
      );
    }
  }
}
