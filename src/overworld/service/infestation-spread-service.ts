import type { Applied } from "../../core/model/domain-event";
import type { Rng } from "../../core/model/rng";
import type { City, CityId } from "../model/city";
import {
  clampInfestation,
  MAX_INFESTATION,
  MIN_INFESTATION,
} from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { InfestationTuning } from "../model/infestation-tuning";
import type {
  InfestationSeededEvent,
  InfestationSpreadEvent,
} from "../model/overworld-domain-event";
import {
  INFESTATION_SEEDED,
  INFESTATION_SPREAD,
} from "../model/overworld-domain-event";
import type { RegionId } from "../model/region";
import type { SpreadCooldowns } from "../model/spread-cooldown";
import { MAX_THREAT, MIN_THREAT } from "../model/threat";
import { findRegion } from "./earth-map-query-service";

// ===========================================
// Types
// ===========================================

/**
 * How strongly each region deters seeding, keyed by region id, as a
 * fraction in `[0, 1]`: `0` is no deterrence, `1` blocks seeding in the
 * region entirely. Produced by the deployable effects tick (#66) from
 * repellent installations; a region with no entry has no deterrence.
 */
export type RegionDeterrence = Readonly<Record<RegionId, number>>;

/** The slice of overworld state the spread step reads and rewrites. */
export interface InfestationSpreadState {
  readonly map: EarthMap;
  readonly cooldowns: SpreadCooldowns;
}

/** Everything the spread step can emit. */
export type InfestationSpreadEventUnion =
  InfestationSpreadEvent | InfestationSeededEvent;

// ===========================================
// Formula
// ===========================================

/**
 * Probability that one clean city is seeded today (GDD §5.3):
 *
 * ```
 *   P = seedChance × threat / 100 × (1 − deterrence)
 * ```
 *
 * Zero at zero threat or full deterrence.
 */
export function seedProbability(
  threat: number,
  deterrence: number,
  tuning: InfestationTuning,
): number {
  return (tuning.seedChance * threat * (1 - deterrence)) / MAX_THREAT;
}

// ===========================================
// Tick step
// ===========================================

/**
 * Advances one day of infestation spread and seeding. Runs after growth
 * in the daily tick. The input map and cooldowns are never mutated;
 * unchanged cities keep their identity.
 *
 * ```
 *   1. cooldowns tick down by one day; entries at zero are dropped
 *   2. spread   each city ≥ spreadThreshold and off cooldown, in map order:
 *                 candidates = neighbours below MAX_INFESTATION (levels as of
 *                              the start of the day)
 *                 target     = rng.pick(least-infested candidates)
 *                 target    += spreadAmount   (clamped; several sources stack)
 *                 cooldown[city] = spreadCooldownDays
 *   3. seed     each city still clean after spread, in map order:
 *                 rng.chance(seedProbability(threat, deterrence[region]))
 *                 hit ──► city = seedAmount
 * ```
 *
 * RNG draws happen in exactly that order and only for those decisions,
 * so a fixed seed replays the same day. The caller passes a fork of the
 * tick's RNG labelled for this step.
 *
 * @throws {RangeError} if `threat` is outside `[MIN_THREAT, MAX_THREAT]`,
 *   if a deterrence value is outside `[0, 1]` or names an unknown
 *   region, or if a cooldown names an unknown city. Programmer errors in
 *   the calling tick, not game states.
 */
export function applySpread(
  map: EarthMap,
  threat: number,
  deterrence: RegionDeterrence,
  cooldowns: SpreadCooldowns,
  rng: Rng,
  tuning: InfestationTuning,
): Applied<InfestationSpreadState, InfestationSpreadEventUnion> {
  assertThreat(threat);
  assertDeterrence(map, deterrence);
  assertCooldowns(map, cooldowns);

  const events: InfestationSpreadEventUnion[] = [];
  const nextCooldowns = tickCooldowns(cooldowns);
  const levels = new Map(map.cities.map((c) => [c.id, c.infestation]));

  // Step 2: spread. Sources and candidate levels are judged as of the
  // start of the day; received amounts accumulate in `levels`.
  const byId = new Map(map.cities.map((c) => [c.id, c]));
  for (const city of map.cities) {
    if (
      city.infestation < tuning.spreadThreshold ||
      nextCooldowns[city.id] !== undefined
    ) {
      continue;
    }
    const candidates = leastInfestedNeighbours(city, byId);
    if (candidates.length === 0) {
      continue;
    }
    const target = rng.pick(candidates);
    const before = levels.get(target.id) ?? target.infestation;
    const after = clampInfestation(before + tuning.spreadAmount);
    const amount = after - before;
    if (amount <= 0) {
      continue;
    }
    levels.set(target.id, after);
    nextCooldowns[city.id] = tuning.spreadCooldownDays;
    events.push({
      type: INFESTATION_SPREAD,
      payload: { fromCityId: city.id, toCityId: target.id, amount },
    });
  }

  // Step 3: seed cities that are still clean.
  for (const city of map.cities) {
    if (levels.get(city.id) !== MIN_INFESTATION) {
      continue;
    }
    const probability = seedProbability(
      threat,
      deterrence[city.regionId] ?? 0,
      tuning,
    );
    if (!rng.chance(probability)) {
      continue;
    }
    levels.set(city.id, clampInfestation(tuning.seedAmount));
    events.push({ type: INFESTATION_SEEDED, payload: { cityId: city.id } });
  }

  const cities = map.cities.map((city): City => {
    const level = levels.get(city.id) ?? city.infestation;
    return level === city.infestation ? city : { ...city, infestation: level };
  });
  return {
    state: {
      map: { regions: map.regions, cities },
      cooldowns: nextCooldowns,
    },
    events,
  };
}

// ===========================================
// Helpers
// ===========================================

/** Returns a copy of `cooldowns` one day later, without expired entries. */
function tickCooldowns(cooldowns: SpreadCooldowns): Record<CityId, number> {
  const next: Record<CityId, number> = {};
  for (const [cityId, days] of Object.entries(cooldowns)) {
    if (days > 1) {
      next[cityId] = days - 1;
    }
  }
  return next;
}

/**
 * Returns the neighbours of `city` that can still receive infestation and
 * share the lowest infestation among them, in `neighbourIds` order.
 */
function leastInfestedNeighbours(
  city: City,
  byId: ReadonlyMap<CityId, City>,
): City[] {
  const open = city.neighbourIds
    .map((id) => byId.get(id))
    .filter(
      (n): n is City => n !== undefined && n.infestation < MAX_INFESTATION,
    );
  const lowest = Math.min(...open.map((n) => n.infestation));
  return open.filter((n) => n.infestation === lowest);
}

// ===========================================
// Validation
// ===========================================

/** Rejects a threat outside the range `computeThreat` produces. */
function assertThreat(threat: number): void {
  if (!Number.isFinite(threat) || threat < MIN_THREAT || threat > MAX_THREAT) {
    throw new RangeError(
      `Invalid threat ${String(threat)}: must be a finite number in [${MIN_THREAT}, ${MAX_THREAT}]`,
    );
  }
}

/** Rejects deterrence entries outside `[0, 1]` or for unknown regions. */
function assertDeterrence(map: EarthMap, deterrence: RegionDeterrence): void {
  for (const [regionId, value] of Object.entries(deterrence)) {
    if (findRegion(map, regionId) === undefined) {
      throw new RangeError(
        `Deterrence names unknown region "${regionId}"; keys must be region ids`,
      );
    }
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(
        `Invalid deterrence ${String(value)} for region "${regionId}": must be a number in [0, 1]`,
      );
    }
  }
}

/** Rejects cooldowns for unknown cities or with non-positive-integer days. */
function assertCooldowns(map: EarthMap, cooldowns: SpreadCooldowns): void {
  const ids = new Set(map.cities.map((c) => c.id));
  for (const [cityId, days] of Object.entries(cooldowns)) {
    if (!ids.has(cityId)) {
      throw new RangeError(
        `Cooldown names unknown city "${cityId}"; keys must be city ids`,
      );
    }
    if (!Number.isInteger(days) || days <= 0) {
      throw new RangeError(
        `Invalid cooldown ${String(days)} for city "${cityId}": must be a positive integer`,
      );
    }
  }
}
