import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../tactical/model/unit-weapon";
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
 * v8 → v9 (#409): units in a live mission gain `charges`, filled from
 * their template's pool. Templates saved before v9 carry no pool, so a
 * mission in flight at upgrade time stays unlimited until it ends; no
 * mission in progress means nothing to touch.
 */
const ADD_UNIT_CHARGES: Migration = {
  from: 8,
  to: 9,
  apply(state) {
    if (!isRecord(state)) {
      throw new Error("v8 state is not an object");
    }
    const mission = state.activeMission;
    if (!isRecord(mission) || !Array.isArray(mission.units)) {
      return state;
    }
    const templates = isRecord(mission.templates) ? mission.templates : {};
    const units = mission.units.map((unit: unknown) => {
      if (!isRecord(unit) || "charges" in unit) {
        return unit;
      }
      const templateId =
        typeof unit.templateId === "string" ? unit.templateId : "";
      const template = templates[templateId];
      const charges = isRecord(template) ? template.charges : undefined;
      return typeof charges === "number" ? { ...unit, charges } : unit;
    });
    return { ...state, activeMission: { ...mission, units } };
  },
};

/**
 * v9 → v10 (#329): a mission in progress gains its spawn clocks. A mission
 * already under way was launched before `difficulty` and `threat` were
 * recorded, so it takes the gentlest values; every spawner gets a
 * `timer` at the hatch interval shipped at the time, three bug phases.
 * The `3` is deliberately a literal, not `SPAWN_TUNING.hatchInterval`:
 * migrations are frozen data and must keep producing the same v10 state
 * however the tuning moves later.
 */
const ADD_SPAWN_CLOCKS: Migration = {
  from: 9,
  to: 10,
  apply(state) {
    if (!isRecord(state) || !isRecord(state.overworld)) {
      throw new Error("v9 state has no overworld slice");
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

/**
 * v10 → v11 (#531, ADR 0006): a mission in progress gains `vision`. Both
 * sides start with nothing seen: `visible` and `spotted` are recomputed
 * from scratch by the first `withVision` after load, so a stale or
 * hand-edited value can never leak knowledge (§2.5), and `explored`
 * cannot be recomputed at all.
 *
 * That means a save carried across this upgrade re-hides ground the
 * player had already scouted. It is a real regression for exactly the one
 * mission in flight, and the alternative is inventing explored ground
 * that was never seen. The ADR takes the honest reset.
 */
const ADD_MISSION_VISION: Migration = {
  from: 10,
  to: 11,
  apply: (state) => {
    if (!isRecord(state)) {
      return state;
    }
    const mission = state.activeMission;
    if (!isRecord(mission) || isRecord(mission.vision)) {
      return state;
    }
    const empty = { visible: [], explored: [], spotted: [] };
    return {
      ...state,
      activeMission: {
        ...mission,
        vision: { tdf: { ...empty }, bugs: { ...empty } },
      },
    };
  },
};

/**
 * v12 → v13 (#667): a mission in progress gains `commandSeq`, the nonce
 * that makes each command's RNG fork distinct.
 *
 * It is seeded from `log.length`, which is what the label used to read,
 * so a save in flight keeps rolling the stream it was already on rather
 * than jumping. From here the two are independent, which is the point:
 * capping or filtering the log can no longer reroll the dice.
 */
const ADD_COMMAND_SEQ: Migration = {
  from: 12,
  to: 13,
  apply: (state) => {
    if (!isRecord(state)) {
      return state;
    }
    const mission = state.activeMission;
    if (!isRecord(mission) || typeof mission.commandSeq === "number") {
      return state;
    }
    return {
      ...state,
      activeMission: {
        ...mission,
        commandSeq: Array.isArray(mission.log) ? mission.log.length : 0,
      },
    };
  },
};

/**
 * v13 → v14 (#716): each side's vision gains `lastSeen`, where it last
 * saw each enemy.
 *
 * Empty, not reconstructed. The record is a memory of a sighting and a
 * save holds no history to rebuild one from — inventing entries would
 * hand a side positions it never observed, which is the one thing ADR
 * 0006 §2.3 forbids. A mission carried across the upgrade simply starts
 * remembering from its next look, which costs a bug one turn of hunting.
 */
const ADD_VISION_LAST_SEEN: Migration = {
  from: 13,
  to: 14,
  apply: (state) => {
    if (!isRecord(state)) {
      return state;
    }
    const mission = state.activeMission;
    if (!isRecord(mission) || !isRecord(mission.vision)) {
      return state;
    }
    const vision = Object.fromEntries(
      Object.entries(mission.vision).map(([team, side]) => [
        team,
        isRecord(side) && !isRecord(side.lastSeen)
          ? { ...side, lastSeen: {} }
          : side,
      ]),
    );
    return { ...state, activeMission: { ...mission, vision } };
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
/**
 * v11 → v12 (#532): a unit's weapons become a list and its charges a
 * record keyed by weapon.
 *
 * Every template saved before v12 carried exactly one `weapon` and, if
 * it had a pool, one `charges` number — so the conversion is exact:
 * the weapon becomes the single `primary` entry and the unit's remaining
 * charges are filed under it. Nothing is guessed.
 *
 * A save with no mission in progress has no units and no templates to
 * touch, which is the common case.
 */
const SPLIT_WEAPONS_PER_UNIT: Migration = {
  from: 11,
  to: 12,
  apply(state) {
    if (!isRecord(state)) {
      throw new Error("v11 state is not an object");
    }
    const mission = state.activeMission;
    if (!isRecord(mission)) {
      return state;
    }
    const templates = isRecord(mission.templates) ? mission.templates : {};
    const migratedTemplates = Object.fromEntries(
      Object.entries(templates).map(([id, template]) => {
        if (!isRecord(template) || Array.isArray(template.weapons)) {
          return [id, template];
        }
        const { weapon, charges, ...rest } = template;
        return [
          id,
          {
            ...rest,
            weapons: [
              {
                id: PRIMARY_WEAPON_ID,
                name: DEFAULT_WEAPON_NAME,
                profile: weapon,
                ...(typeof charges === "number" ? { charges } : {}),
              },
            ],
          },
        ];
      }),
    );
    const units = Array.isArray(mission.units)
      ? mission.units.map((unit: unknown) => {
          if (!isRecord(unit) || typeof unit.charges !== "number") {
            return unit;
          }
          return { ...unit, charges: { [PRIMARY_WEAPON_ID]: unit.charges } };
        })
      : mission.units;
    return {
      ...state,
      activeMission: { ...mission, templates: migratedTemplates, units },
    };
  },
};

export const GAME_STATE_MIGRATIONS: readonly Migration[] = [
  ADD_SPREAD_COOLDOWNS,
  ADD_CITY_SCALE,
  ADD_GRAVEYARD,
  ADD_THREAT_OFFSET,
  RESERVE_ACTIVE_MISSION,
  DROP_META_DEBUG,
  ADD_MISSION_EXTRACTED,
  ADD_UNIT_CHARGES,
  ADD_SPAWN_CLOCKS,
  ADD_MISSION_VISION,
  SPLIT_WEAPONS_PER_UNIT,
  ADD_COMMAND_SEQ,
  ADD_VISION_LAST_SEEN,
];
