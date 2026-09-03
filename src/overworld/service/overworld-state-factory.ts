import type { Rng } from "../../core/model/rng";
import type { CityId } from "../model/city";
import { MAX_INFESTATION, MIN_INFESTATION } from "../model/city";
import type { EarthMap } from "../model/earth-map";
import type { InclusiveRange, NewGameTuning } from "../model/new-game-tuning";
import type { OverworldState } from "../model/overworld-state";
import { FIRST_DAY } from "../model/overworld-state";
import type { ThreatTuning } from "../model/threat-tuning";
import { computeThreat } from "./threat-service";

// ===========================================
// Dependencies
// ===========================================

/** What the overworld factory needs injected. */
export interface OverworldStateFactoryDeps {
  /** Stream the opening infestation is drawn from; the caller forks it. */
  readonly rng: Rng;
  readonly tuning: NewGameTuning;
  readonly threatTuning: ThreatTuning;
}

// ===========================================
// Factory
// ===========================================

/**
 * Builds the overworld a new campaign starts on: the given Earth with a
 * few cities seeded with infestation, day `FIRST_DAY`, the threat that
 * map implies, and nothing else happening yet.
 *
 * Draws from `deps.rng`, in order:
 *
 * ```
 *   1. count  = nextInt(infestedCities)            how many cities
 *   2. picks  = shuffle(map.cities)[0 .. count)    which ones, distinct
 *   3. level  = nextInt(initialInfestation)        once per picked city
 * ```
 *
 * The order is part of the determinism contract: changing it changes
 * every campaign's opening for a given seed.
 *
 * @throws {RangeError} if a tuning range is not an integer range with
 *   `min <= max`, asks for more cities than the map has, or leaves the
 *   city infestation bounds.
 */
export function createInitialOverworldState(
  map: EarthMap,
  deps: OverworldStateFactoryDeps,
): OverworldState {
  assertRange(
    deps.tuning.infestedCities,
    "infestedCities",
    0,
    map.cities.length,
  );
  assertRange(
    deps.tuning.initialInfestation,
    "initialInfestation",
    MIN_INFESTATION,
    MAX_INFESTATION,
  );
  const seeded = seedInfestation(map, deps.rng, deps.tuning);
  return {
    day: FIRST_DAY,
    map: seeded,
    threat: computeThreat(seeded, FIRST_DAY, deps.threatTuning),
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
  };
}

// ===========================================
// Seeding
// ===========================================

/** Returns a copy of `map` with a random set of cities infested. */
function seedInfestation(
  map: EarthMap,
  rng: Rng,
  tuning: NewGameTuning,
): EarthMap {
  const count = rng.nextInt(
    tuning.infestedCities.min,
    tuning.infestedCities.max,
  );
  const picked = rng.shuffle(map.cities).slice(0, count);
  const levels = new Map<CityId, number>();
  for (const city of picked) {
    levels.set(
      city.id,
      rng.nextInt(tuning.initialInfestation.min, tuning.initialInfestation.max),
    );
  }
  const cities = map.cities.map((city) => {
    const level = levels.get(city.id);
    return level === undefined ? city : { ...city, infestation: level };
  });
  return { regions: map.regions, cities };
}

// ===========================================
// Validation
// ===========================================

/** Throws unless `range` is an integer range inside `[lowest, highest]`. */
function assertRange(
  range: InclusiveRange,
  label: string,
  lowest: number,
  highest: number,
): void {
  const valid =
    Number.isInteger(range.min) &&
    Number.isInteger(range.max) &&
    range.min <= range.max &&
    range.min >= lowest &&
    range.max <= highest;
  if (!valid) {
    throw new RangeError(
      `Invalid ${label} range ${String(range.min)}..${String(range.max)}: must be integers with ${lowest} <= min <= max <= ${highest}`,
    );
  }
}
