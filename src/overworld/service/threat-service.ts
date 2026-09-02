import { MAX_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { RegionId } from "../model/region";
import { MAX_THREAT, MIN_THREAT } from "../model/threat";
import type { ThreatTuning } from "../model/threat-tuning";
import { citiesInRegion } from "./earth-map-query-service";

// ===========================================
// Infestation aggregates
// ===========================================

/**
 * Mean infestation of a region's cities, in `[0, MAX_INFESTATION]`
 * (GDD §5.1: regions aggregate their cities). Throws on an unknown region.
 */
export function regionInfestation(map: EarthMap, regionId: RegionId): number {
  return mean(citiesInRegion(map, regionId).map((city) => city.infestation));
}

/** Mean infestation over every city on Earth, in `[0, MAX_INFESTATION]`. */
export function globalInfestation(map: EarthMap): number {
  return mean(map.cities.map((city) => city.infestation));
}

/**
 * How much of Earth is bug-free, in `[0, 1]`: `1` when every city is at
 * zero, `0` when every city is overrun. The economy scales the daily
 * stipend by this (GDD §5.5).
 */
export function unfestedFraction(map: EarthMap): number {
  return 1 - globalInfestation(map) / MAX_INFESTATION;
}

// ===========================================
// Threat
// ===========================================

/**
 * Threat added by elapsed time alone: linear in `day`, saturating at
 * `escalationCap`. Never decreases as `day` grows.
 *
 * ```
 *   escalation
 *   cap ┤          ┌────────────
 *       │        ╱
 *       │      ╱   slope = escalationPerDay
 *     0 ┼────╱──────────────────► day
 * ```
 *
 * @throws {RangeError} if `day` is negative or not finite.
 */
export function escalation(day: number, tuning: ThreatTuning): number {
  if (!Number.isFinite(day) || day < 0) {
    throw new RangeError(
      `Invalid day ${String(day)}: must be a finite non-negative number`,
    );
  }
  return Math.min(tuning.escalationCap, tuning.escalationPerDay * day);
}

/**
 * Global threat level (GDD §5.1): mean city infestation weighted by
 * `infestationWeight`, plus the escalation for `day`, clamped to
 * `[MIN_THREAT, MAX_THREAT]`. Pure: the orchestrator stores the result
 * on the overworld state.
 *
 * @throws {RangeError} if `day` is negative or not finite.
 */
export function computeThreat(
  map: EarthMap,
  day: number,
  tuning: ThreatTuning,
): number {
  const fromInfestation = globalInfestation(map) * tuning.infestationWeight;
  return clamp(
    fromInfestation + escalation(day, tuning),
    MIN_THREAT,
    MAX_THREAT,
  );
}

// ===========================================
// Math
// ===========================================

/** Arithmetic mean; `0` for an empty list. */
function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
