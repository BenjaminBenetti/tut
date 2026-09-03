import type { SettlementScale } from "../../content/model/settlement-scale";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { DEFAULT_CITY_SCALE } from "../../overworld/service/earth-map-builder";
import type { Migration } from "../model/migration";

// ===========================================
// Steps
// ===========================================

/** True for a plain object (not null, not an array). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2 (#58): the overworld slice gains `spreadCooldowns`, the days
 * each city must wait before spreading again. No city had spread in a
 * v1 save, so every city starts off cooldown.
 */
const ADD_SPREAD_COOLDOWNS: Migration = {
  from: 1,
  to: 2,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v1 state has no overworld slice");
    }
    return {
      ...state,
      overworld: { ...state.overworld, spreadCooldowns: {} },
    };
  },
};

/**
 * Settlement scale of every shipped city, so a migrated save gets the
 * same scale a new campaign would (Perth stays a town). Built once at
 * module load from the seed data.
 */
const SHIPPED_CITY_SCALES: ReadonlyMap<string, SettlementScale> = new Map(
  EARTH_MAP.cities.map((city) => [city.id, city.scale]),
);

/**
 * v2 → v3 (#61): every city gains a required `scale` used for mission
 * map parameters. Cities from the shipped Earth take their seed's scale;
 * any other id (a future custom map) falls back to `DEFAULT_CITY_SCALE`.
 * A city that already carries a scale is left alone.
 */
const ADD_CITY_SCALE: Migration = {
  from: 2,
  to: 3,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v2 state has no overworld slice");
    }
    const map = state.overworld.map;
    if (!isRecord(map) || !Array.isArray(map.cities)) {
      throw new Error("v2 overworld has no map with cities");
    }
    const cities = map.cities.map((city: unknown) => {
      if (!isRecord(city) || typeof city.id !== "string") {
        throw new Error("v2 map has a city without a string id");
      }
      if (city.scale !== undefined) {
        return city;
      }
      return {
        ...city,
        scale: SHIPPED_CITY_SCALES.get(city.id) ?? DEFAULT_CITY_SCALE,
      };
    });
    return {
      ...state,
      overworld: { ...state.overworld, map: { ...map, cities } },
    };
  },
};

/**
 * v3 → v4 (#64): the roster slice gains `graveyard`, the squads and
 * mechs lost in missions. No mission had been resolved against a v3
 * save, so it starts empty. A roster that already carries one is left
 * alone.
 */
const ADD_GRAVEYARD: Migration = {
  from: 3,
  to: 4,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.roster)) {
      throw new Error("v3 state has no roster slice");
    }
    if (state.roster.graveyard !== undefined) {
      return state;
    }
    return { ...state, roster: { ...state.roster, graveyard: [] } };
  },
};

// ===========================================
// Chain
// ===========================================

/**
 * Ordered forward migrations for `GameState`. Append one entry per
 * schema bump; never edit or remove an existing entry, since old saves
 * in players' browsers depend on it.
 */
export const GAME_STATE_MIGRATIONS: readonly Migration[] = [
  ADD_SPREAD_COOLDOWNS,
  ADD_CITY_SCALE,
  ADD_GRAVEYARD,
];
