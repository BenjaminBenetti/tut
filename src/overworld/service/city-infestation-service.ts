import type { City, CityId } from "../model/city";
import { clampInfestation, withInfestation } from "../model/city";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";

// ===========================================
// City infestation
// ===========================================

/**
 * The overworld with city `cityId` at infestation `to`, clamped to the
 * city's bounds, and a `CityInfestationChanged` when the value actually
 * moved. The detection invariant is kept by `withInfestation`: a city
 * set to 0 is forgotten. Returns `state` itself, with no event, when the
 * clamped value equals the city's current one or the city is not on the
 * map.
 *
 * ```
 *   to ──clamp──► same as now? ──yes──► { state, [] }
 *                      │no
 *                      └──► city' = withInfestation(city, to) ──► CityInfestationChanged { from, to }
 * ```
 */
export function setCityInfestation(
  state: OverworldState,
  cityId: CityId,
  to: number,
): OverworldApplied<OverworldState> {
  const city = state.map.cities.find((candidate) => candidate.id === cityId);
  if (city === undefined) {
    return { state, events: [] };
  }
  const clamped = clampInfestation(to);
  if (clamped === city.infestation) {
    return { state, events: [] };
  }
  const cities = state.map.cities.map((candidate): City =>
    candidate.id === cityId ? withInfestation(candidate, clamped) : candidate,
  );
  return {
    state: { ...state, map: { regions: state.map.regions, cities } },
    events: [
      {
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId, from: city.infestation, to: clamped },
      },
    ],
  };
}

/**
 * The overworld with `delta` added to city `cityId`'s infestation,
 * clamped; see `setCityInfestation`. A city not on the map is left
 * alone.
 */
export function addCityInfestation(
  state: OverworldState,
  cityId: CityId,
  delta: number,
): OverworldApplied<OverworldState> {
  const city = state.map.cities.find((candidate) => candidate.id === cityId);
  if (city === undefined) {
    return { state, events: [] };
  }
  return setCityInfestation(state, cityId, city.infestation + delta);
}
