import { isRecord } from "../../core/model/record-guard";
import { DEFAULT_CITY_POPULATION } from "../../overworld/service/earth-map-builder";
import { CITY_POPULATION_SNAPSHOT } from "../data/city-population-snapshot";
import type { Migration } from "../model/migration";

// ===========================================
// v23 → v24: city populations
// ===========================================

/**
 * v23 → v24 (#1154): every city gains a required `population`. Cities
 * from the shipped Earth take the frozen v24 figure for their id; any
 * other id (a custom map) falls back to `DEFAULT_CITY_POPULATION`. A
 * city that already carries a population is left alone, and the map of
 * a mission in flight is not touched: it is a frozen copy the tactical
 * rules never read a population from.
 *
 * ```
 *   overworld.map.cities[i]            ┌─ has population ──► unchanged
 *     ──► id in snapshot? ─────────────┤─ yes ─────────────► snapshot[id]
 *                                      └─ no ──────────────► DEFAULT_CITY_POPULATION
 * ```
 */
export const ADD_CITY_POPULATION: Migration = {
  from: 23,
  to: 24,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v23 state has no overworld slice");
    }
    const map = state.overworld.map;
    if (!isRecord(map) || !Array.isArray(map.cities)) {
      throw new Error("v23 overworld has no map with cities");
    }
    const cities = map.cities.map((city: unknown) => {
      if (!isRecord(city) || typeof city.id !== "string") {
        throw new Error("v23 map has a city without a string id");
      }
      if (typeof city.population === "number") {
        return city;
      }
      return {
        ...city,
        population:
          CITY_POPULATION_SNAPSHOT[city.id] ?? DEFAULT_CITY_POPULATION,
      };
    });
    return {
      ...state,
      overworld: { ...state.overworld, map: { ...map, cities } },
    };
  },
};
