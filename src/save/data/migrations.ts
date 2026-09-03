import type { SettlementScale } from "../../content/model/settlement-scale";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { DEFAULT_CITY_SCALE } from "../../overworld/service/earth-map-builder";
import type { Migration } from "../model/migration";
import { isRecord } from "../../core/model/record-guard";

// ===========================================
// Steps
// ===========================================

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

/**
 * v4 → v5 (#307): the overworld slice gains `threatOffset`, the lasting
 * shift event choices leave on the global threat. No event could shift
 * it lastingly before, so every v4 save starts at zero.
 */
const ADD_THREAT_OFFSET: Migration = {
  from: 4,
  to: 5,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v4 state has no overworld slice");
    }
    return {
      ...state,
      overworld: { ...state.overworld, threatOffset: 0 },
    };
  },
};

/**
 * v5 → v6 (#323): `activeMission` becomes the tactical state slot. No v5
 * save was ever written mid-mission, so the slot stays absent; the step
 * only asserts the root shape it will be read from.
 */
const RESERVE_ACTIVE_MISSION: Migration = {
  from: 5,
  to: 6,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v5 state has no overworld slice");
    }
    const { activeMission: _absent, ...rest } = state;
    return rest;
  },
};

/**
 * v6 → v7 (#304): `meta.debug` is gone. The dev-only threat escalation
 * switch used to ride in the save, so a dev-made save carried it into
 * production; it now lives in the composition. Any stored value is
 * dropped so an old save plays at the shipped pace.
 */
const DROP_META_DEBUG: Migration = {
  from: 6,
  to: 7,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.meta)) {
      throw new Error("v6 state has no meta");
    }
    if (!("debug" in state.meta)) {
      return state;
    }
    const { debug: _dropped, ...meta } = state.meta;
    return { ...state, meta };
  },
};

/**
 * v7 → v8 (#328): a mission in progress gains `extracted`, the units that
 * left through the extraction zone. Nothing could extract before the turn
 * engine, so an existing mission starts with none; a save without a
 * mission is untouched.
 */
const ADD_MISSION_EXTRACTED: Migration = {
  from: 7,
  to: 8,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v7 state has no overworld slice");
    }
    const mission = state.activeMission;
    if (!isRecord(mission) || Array.isArray(mission.extracted)) {
      return state;
    }
    return { ...state, activeMission: { ...mission, extracted: [] } };
  },
};

/**
 * v8 → v9 (#329): a mission in progress gains its spawn clocks. A mission
 * already under way was launched before `difficulty` and `threat` were
 * recorded, so it takes the gentlest values; every spawner gets a
 * `timer` at the hatch interval shipped at the time, three bug phases.
 * The `3` is deliberately a literal, not `SPAWN_TUNING.hatchInterval`:
 * migrations are frozen data and must keep producing the same v9 state
 * however the tuning moves later.
 */
const ADD_SPAWN_CLOCKS: Migration = {
  from: 8,
  to: 9,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v8 state has no overworld slice");
    }
    const mission = state.activeMission;
    if (!isRecord(mission)) {
      return state;
    }
    const spawners = Array.isArray(mission.spawners)
      ? mission.spawners.map((spawner: unknown) =>
          isRecord(spawner) && typeof spawner.timer !== "number"
            ? { ...spawner, timer: 3 }
            : spawner,
        )
      : mission.spawners;
    return {
      ...state,
      activeMission: {
        ...mission,
        difficulty:
          typeof mission.difficulty === "number" ? mission.difficulty : 1,
        threat: typeof mission.threat === "number" ? mission.threat : 0,
        spawners,
      },
    };
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
  ADD_THREAT_OFFSET,
  RESERVE_ACTIVE_MISSION,
  DROP_META_DEBUG,
  ADD_MISSION_EXTRACTED,
  ADD_SPAWN_CLOCKS,
];
