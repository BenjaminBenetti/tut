import { isRecord } from "../../core/model/record-guard";
import { MIN_DEPLOYABLE_LEVEL } from "../../overworld/model/deployable-level";
import type { Migration } from "../model/migration";

// ===========================================
// v24 → v25: deployable levels and city detection
// ===========================================

/**
 * v24 → v25 (#1155): every installation gains a required `level` and
 * every city a required `detected`. An installation built before levels
 * existed is a level 1 one, which is exactly what it was; a city that is
 * infested was visible to the player, so it is `detected`, and a clean
 * city is not (the invariant `withInfestation` keeps). Fields already
 * present are left alone, and the map of a mission in flight is not
 * touched: it is a frozen copy the tactical rules never read either
 * field from.
 *
 * ```
 *   overworld.deployables[i]  ──► has level? ── no ──► level: 1
 *   overworld.map.cities[i]   ──► has detected? ─ no ──► detected: infestation > 0
 * ```
 */
export const ADD_DEPLOYABLE_LEVELS: Migration = {
  from: 24,
  to: 25,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v24 state has no overworld slice");
    }
    const { overworld } = state;
    const map = overworld.map;
    if (!isRecord(map) || !Array.isArray(map.cities)) {
      throw new Error("v24 overworld has no map with cities");
    }
    if (!Array.isArray(overworld.deployables)) {
      throw new Error("v24 overworld has no deployables");
    }
    const cities = map.cities.map((city: unknown) => {
      if (!isRecord(city) || typeof city.infestation !== "number") {
        throw new Error("v24 map has a city without a numeric infestation");
      }
      if (typeof city.detected === "boolean") {
        return city;
      }
      return { ...city, detected: city.infestation > 0 };
    });
    const deployables = overworld.deployables.map((deployable: unknown) => {
      if (!isRecord(deployable)) {
        throw new Error("v24 overworld has a deployable that is not an object");
      }
      if (typeof deployable.level === "number") {
        return deployable;
      }
      return { ...deployable, level: MIN_DEPLOYABLE_LEVEL };
    });
    return {
      ...state,
      overworld: { ...overworld, map: { ...map, cities }, deployables },
    };
  },
};
