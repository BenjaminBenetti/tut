import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { MapSizeId } from "../../content/model/map-size-id";
import type { MissionType } from "../../content/model/mission-type";
import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { City, CityId } from "../model/city";
import { clampInfestation, MAX_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { Mission } from "../model/mission";
import type {
  MissionTuning,
  MissionTypeGenerationRule,
} from "../model/mission-tuning";
import type {
  OverworldApplied,
  OverworldDomainEvent,
} from "../model/overworld-domain-event";
import {
  CITY_INFESTATION_CHANGED,
  MISSION_EXPIRED,
  MISSION_OFFERED,
} from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import { MAX_THREAT } from "../model/threat";
import { findRegion, getRegion } from "./earth-map-query-service";

// ===========================================
// Types
// ===========================================

/**
 * Extra days of mission availability per region, keyed by region id.
 * Produced by the deployable effects tick (#66) from sensor coverage; a
 * region with no entry gets no bonus. Values are non-negative integers.
 */
export type IntelBonus = Readonly<Record<RegionId, number>>;

/** The mission type definitions, keyed by id; the app passes `MISSION_TYPES`. */
export type MissionTypeCatalogue = Readonly<Record<MissionTypeId, MissionType>>;

/** What the generation step draws from. */
export interface MissionGenerationDeps {
  readonly intelBonus: IntelBonus;
  /** Stream for offer rolls and map seeds; the caller forks it per tick. */
  readonly rng: Rng;
  /** Issues mission ids with the `"mission"` prefix. */
  readonly ids: IdGenerator;
  readonly tuning: MissionTuning;
  readonly missionTypes: MissionTypeCatalogue;
}

// ===========================================
// Constants
// ===========================================

/** Prefix mission ids are issued under. */
export const MISSION_ID_PREFIX = "mission";

/** Largest value drawn for a mission's map seed. */
const MAX_MAP_SEED = 0xffffffff;

// ===========================================
// Formulae
// ===========================================

/**
 * Daily chance a city at `infestation` is offered a mission of the rule's
 * type: `0` below `minInfestation`, then linear from `chanceAtThreshold`
 * up to `chanceAtMax` at `MAX_INFESTATION`.
 */
export function offerChance(
  infestation: number,
  rule: MissionTypeGenerationRule,
): number {
  if (infestation < rule.minInfestation) {
    return 0;
  }
  const span = MAX_INFESTATION - rule.minInfestation;
  const progress = span === 0 ? 1 : (infestation - rule.minInfestation) / span;
  return (
    rule.chanceAtThreshold +
    (rule.chanceAtMax - rule.chanceAtThreshold) * progress
  );
}

/**
 * Integer difficulty for a mission of `type` at a city with `infestation`
 * while global threat is `threat`: the weighted pressure maps linearly
 * onto the type's band and is clamped into both the band and
 * `MISSION_DIFFICULTY_RANGE`.
 */
export function difficultyFor(
  infestation: number,
  threat: number,
  type: MissionType,
  rule: MissionTypeGenerationRule,
): number {
  const pressure =
    rule.infestationWeight * (infestation / MAX_INFESTATION) +
    rule.threatWeight * (threat / MAX_THREAT);
  const band = type.difficultyBand;
  const raw = band.min + (band.max - band.min) * pressure;
  const low = Math.max(band.min, MISSION_DIFFICULTY_RANGE.min);
  const high = Math.min(band.max, MISSION_DIFFICULTY_RANGE.max);
  return Math.min(high, Math.max(low, Math.round(raw)));
}

/** Named map size for a difficulty: small, then medium and large from the rule's thresholds. */
export function mapSizeFor(
  difficulty: number,
  rule: MissionTypeGenerationRule,
): MapSizeId {
  if (difficulty >= rule.largeFromDifficulty) {
    return "large";
  }
  if (difficulty >= rule.mediumFromDifficulty) {
    return "medium";
  }
  return "small";
}

// ===========================================
// Tick step: expiry
// ===========================================

/**
 * Removes every mission whose `expiresDay` has arrived (`day >= expiresDay`)
 * and adds each one's frozen `ignorePenalty` to its host city, clamped.
 * Emits a `MissionExpired` per lapsed mission, in mission order, then a
 * `CityInfestationChanged` per city whose infestation actually moved, in
 * map order. Returns the input state untouched when nothing expired.
 *
 * ```
 *   missions ──► [expired | kept]
 *                    │
 *                    ├─► MissionExpired × n
 *                    └─► city.infestation += Σ ignorePenalty ──► CityInfestationChanged
 * ```
 */
export function expireMissions(
  state: OverworldState,
): OverworldApplied<OverworldState> {
  const expired = state.missions.filter(
    (mission) => state.day >= mission.expiresDay,
  );
  if (expired.length === 0) {
    return { state, events: [] };
  }
  const kept = state.missions.filter(
    (mission) => state.day < mission.expiresDay,
  );

  const events: OverworldDomainEvent[] = [];
  const penalties = new Map<CityId, number>();
  for (const mission of expired) {
    events.push({
      type: MISSION_EXPIRED,
      payload: {
        missionId: mission.id,
        typeId: mission.typeId,
        cityId: mission.cityId,
        ignorePenalty: mission.ignorePenalty,
      },
    });
    penalties.set(
      mission.cityId,
      (penalties.get(mission.cityId) ?? 0) + mission.ignorePenalty,
    );
  }

  const cities = state.map.cities.map((city): City => {
    const penalty = penalties.get(city.id);
    if (penalty === undefined) {
      return city;
    }
    const to = clampInfestation(city.infestation + penalty);
    if (to === city.infestation) {
      return city;
    }
    events.push({
      type: CITY_INFESTATION_CHANGED,
      payload: { cityId: city.id, from: city.infestation, to },
    });
    return { ...city, infestation: to };
  });

  return {
    state: {
      ...state,
      map: { regions: state.map.regions, cities },
      missions: kept,
    },
    events,
  };
}

// ===========================================
// Tick step: generation
// ===========================================

/**
 * Offers new missions for `state.day`. Every city without an active
 * mission is visited in map order; for each mission type in
 * `MISSION_TYPE_IDS` order with a positive `offerChance`, one `chance`
 * draw decides whether that type is offered, and the first success wins
 * the city for the day. An offered mission draws one more number for its
 * map seed and takes the next `"mission"` id.
 *
 * ```
 *   for city in map.cities (no active mission):
 *     for type in MISSION_TYPE_IDS:
 *       p = offerChance(city.infestation, rule[type])
 *       p > 0 and rng.chance(p) ──► mission { difficulty, rewards, expiry, mapParams }
 *                                    ──► MissionOffered, next city
 * ```
 *
 * The draw order is part of the determinism contract: the same state,
 * seed and deps always offer the same missions. Returns the input state
 * untouched when nothing was offered.
 *
 * @throws {RangeError} if `intelBonus` names a region that is not on the
 *   map or holds a value that is not a non-negative integer. Those are
 *   programmer errors in the calling tick, not game states.
 */
export function generateMissions(
  state: OverworldState,
  deps: MissionGenerationDeps,
): OverworldApplied<OverworldState> {
  assertIntelBonus(state.map, deps.intelBonus);

  const occupied = new Set(state.missions.map((mission) => mission.cityId));
  const offered: Mission[] = [];
  for (const city of state.map.cities) {
    if (occupied.has(city.id)) {
      continue;
    }
    for (const typeId of MISSION_TYPE_IDS) {
      const rule = deps.tuning.rules[typeId];
      const chance = offerChance(city.infestation, rule);
      if (chance <= 0 || !deps.rng.chance(chance)) {
        continue;
      }
      offered.push(
        createMission(state, city, deps.missionTypes[typeId], rule, deps),
      );
      break;
    }
  }

  if (offered.length === 0) {
    return { state, events: [] };
  }
  return {
    state: { ...state, missions: [...state.missions, ...offered] },
    events: offered.map((mission) => ({
      type: MISSION_OFFERED,
      payload: { mission },
    })),
  };
}

// ===========================================
// Helpers
// ===========================================

/** Assembles one mission for `city` on `state.day`, drawing its id and map seed. */
function createMission(
  state: OverworldState,
  city: City,
  type: MissionType,
  rule: MissionTypeGenerationRule,
  deps: MissionGenerationDeps,
): Mission {
  const region = getRegion(state.map, city.regionId);
  const difficulty = difficultyFor(city.infestation, state.threat, type, rule);
  const id = deps.ids.nextId(MISSION_ID_PREFIX);
  const mapSeed = deps.rng.nextInt(0, MAX_MAP_SEED);
  const intelDays = deps.intelBonus[region.id] ?? 0;
  return {
    id,
    typeId: type.id,
    cityId: city.id,
    difficulty,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: mapSizeFor(difficulty, rule),
      seed: String(mapSeed),
    },
    rewards: { credits: difficulty * type.rewardPerDifficulty },
    createdDay: state.day,
    expiresDay: state.day + type.expiryDays + intelDays,
    ignorePenalty: type.ignorePenalty,
  };
}

/** Rejects intel entries for unknown regions or with values that are not non-negative integers. */
function assertIntelBonus(map: EarthMap, intelBonus: IntelBonus): void {
  for (const [regionId, days] of Object.entries(intelBonus)) {
    if (findRegion(map, regionId) === undefined) {
      throw new RangeError(
        `Intel bonus names unknown region "${regionId}"; keys must be region ids`,
      );
    }
    if (!Number.isInteger(days) || days < 0) {
      throw new RangeError(
        `Invalid intel bonus ${String(days)} for region "${regionId}": must be a non-negative integer`,
      );
    }
  }
}
