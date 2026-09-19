import { INSTALLATION_SITES } from "../../content/data/installation-sites";
import { mapInfestationLevel } from "../../content/model/map-infestation";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { MapSizeId } from "../../content/model/map-size-id";
import type { MissionType } from "../../content/model/mission-type";
import { MISSION_DIFFICULTY_RANGE } from "../../content/model/mission-type";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { City, CityId } from "../model/city";
import {
  clampInfestation,
  MAX_INFESTATION,
  withInfestation,
} from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { Deployable } from "../model/deployable";
import type {
  InstallationDefence,
  Mission,
  MissionId,
  MissionMapParams,
} from "../model/mission";
import type {
  InstallationDefenceTuning,
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
import type { Region, RegionId } from "../model/region";
import { MAX_THREAT } from "../model/threat";
import { findRegion, getRegion } from "./earth-map-query-service";
import { regionInfestation } from "./threat-service";

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

/**
 * Waves a defend-installation mission sends (#1175) for a region whose
 * mean infestation is `infestation`: `baseWaves` plus one per
 * `1 / wavesPerInfestationPoint` points, floored, capped at `maxWaves`
 * and never below one.
 */
export function wavesFor(
  infestation: number,
  tuning: InstallationDefenceTuning,
): number {
  const raw =
    tuning.baseWaves +
    Math.floor(tuning.wavesPerInfestationPoint * infestation);
  return Math.max(1, Math.min(tuning.maxWaves, raw));
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
    return withInfestation(city, to);
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
 * Offers new missions for `state.day`, in two passes over the types in
 * `MISSION_TYPE_IDS` order, split by their rule's `trigger` (#1175).
 *
 * **City-triggered types.** Every detected city without an active
 * mission is visited in map order (an undetected infestation is one the
 * player has not found, so it cannot be answered, GDD §5.3); for each
 * such type with a positive `offerChance`, one `chance` draw decides
 * whether it is offered, and the first success wins the city for the
 * day. An offered mission draws one more number for its map seed and
 * takes the next `"mission"` id.
 *
 * **Region-triggered types.** Then every region is visited in map
 * order; one holding a built installation whose mean infestation
 * clears the rule's threshold rolls once per such type, and a success
 * attaches the mission to the region's most infested detected city
 * that has no mission yet. A region without an installation, or with
 * no free city, draws nothing.
 *
 * ```
 *   for city in map.cities (detected, no active mission):
 *     for type in MISSION_TYPE_IDS with trigger "city-infestation":
 *       p = offerChance(city.infestation, rule[type])
 *       p > 0 and rng.chance(p) ──► mission { difficulty, rewards, expiry, mapParams }
 *                                    └─ rng.fork(`carcass:${id}`) ──► mapParams.techCarcass?
 *                                    ──► MissionOffered, next city
 *   for region in map.regions (has a deployable):
 *     for type in MISSION_TYPE_IDS with trigger "region-installation":
 *       host = most infested detected free city in the region, or skip
 *       p = offerChance(regionInfestation, rule[type])
 *       p > 0 and rng.chance(p) ──► mission { …, defence }
 *                                    └─ rng.fork(`defence:${id}`) ──► which installation
 *                                    ──► MissionOffered, next region
 * ```
 *
 * The draw order is part of the determinism contract: the same state,
 * seed and deps always offer the same missions, and a campaign with no
 * installation draws exactly what it drew before the second pass
 * existed. Returns the input state untouched when nothing was offered.
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
  const cityTypes = MISSION_TYPE_IDS.filter(
    (typeId) => deps.tuning.rules[typeId].trigger === "city-infestation",
  );
  const regionTypes = MISSION_TYPE_IDS.filter(
    (typeId) => deps.tuning.rules[typeId].trigger === "region-installation",
  );
  for (const city of state.map.cities) {
    if (!city.detected || occupied.has(city.id)) {
      continue;
    }
    for (const typeId of cityTypes) {
      const rule = deps.tuning.rules[typeId];
      const chance = offerChance(city.infestation, rule);
      if (chance <= 0 || !deps.rng.chance(chance)) {
        continue;
      }
      offered.push(
        createMission(state, city, deps.missionTypes[typeId], rule, deps),
      );
      occupied.add(city.id);
      break;
    }
  }
  for (const region of state.map.regions) {
    const installations = state.deployables.filter(
      (deployable) => deployable.regionId === region.id,
    );
    if (installations.length === 0) {
      continue;
    }
    for (const typeId of regionTypes) {
      const rule = deps.tuning.rules[typeId];
      const infestation = regionInfestation(state.map, region.id);
      const chance = offerChance(infestation, rule);
      const host = hostCityFor(state, region, occupied);
      if (chance <= 0 || host === undefined || !deps.rng.chance(chance)) {
        continue;
      }
      const mission = createMission(
        state,
        host,
        deps.missionTypes[typeId],
        rule,
        deps,
      );
      offered.push({
        ...mission,
        defence: defenceFor(mission.id, installations, infestation, deps),
      });
      occupied.add(host.id);
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
      infestation: mapInfestationLevel(city.infestation),
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: mapSizeFor(difficulty, rule),
      seed: String(mapSeed),
      ...techCarcassFor(id, difficulty, deps),
    },
    rewards: {
      credits: difficulty * type.rewardPerDifficulty,
      techPoints:
        type.techRewardBase + difficulty * type.techRewardPerDifficulty,
    },
    createdDay: state.day,
    expiresDay: state.day + type.expiryDays + intelDays,
    ignorePenalty: type.ignorePenalty,
  };
}

/**
 * Rolls whether the mission carries a tech carcass (#1171) on a fork
 * keyed by the mission id, so the roll neither consumes a draw from the
 * campaign RNG (older golden sequences are untouched) nor repeats across
 * missions. Returns the field to spread, or nothing.
 */
function techCarcassFor(
  id: MissionId,
  difficulty: number,
  deps: MissionGenerationDeps,
): Pick<MissionMapParams, "techCarcass"> {
  const tuning = deps.tuning.techCarcass;
  if (!deps.rng.fork(`carcass:${id}`).chance(tuning.chance)) {
    return {};
  }
  return {
    techCarcass: {
      techPoints: tuning.basePoints + tuning.pointsPerDifficulty * difficulty,
    },
  };
}

/**
 * The city a region-triggered mission attaches to (#1175): the most
 * infested detected city in the region that has no mission, existing or
 * offered today; ties keep region order. Undefined when every city is
 * taken or undetected.
 */
function hostCityFor(
  state: OverworldState,
  region: Region,
  occupied: ReadonlySet<CityId>,
): City | undefined {
  let host: City | undefined;
  for (const cityId of region.cityIds) {
    const city = state.map.cities.find((candidate) => candidate.id === cityId);
    if (city === undefined || !city.detected || occupied.has(city.id)) {
      continue;
    }
    if (host === undefined || city.infestation > host.infestation) {
      host = city;
    }
  }
  return host;
}

/**
 * What a defend-installation offer holds (#1175): one of the region's
 * installations, drawn on a fork keyed by the mission id so the choice
 * consumes nothing from the campaign stream, the generators its site
 * stands, and the waves the region's infestation earns.
 */
function defenceFor(
  id: MissionId,
  installations: readonly Deployable[],
  infestation: number,
  deps: MissionGenerationDeps,
): InstallationDefence {
  const target = deps.rng.fork(`defence:${id}`).pick(installations);
  return {
    installation: target.typeId,
    deployableId: target.id,
    generators: INSTALLATION_SITES[target.typeId].generators,
    waves: wavesFor(infestation, deps.tuning.defence),
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
