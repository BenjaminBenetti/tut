import type { IdGenerator } from "../../core/model/id-generator";
import type { City } from "../model/city";
import { clampInfestation, withInfestation } from "../model/city";
import type { CityInfestationChangedEvent } from "../model/city-infestation-changed-event";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { Hive, HiveId } from "../model/hive";
import { HIVE_ID_PREFIX } from "../model/hive";
import { HIVE_FORMED } from "../model/hive-formed-event";
import type { HiveTuning } from "../model/hive-tuning";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import { findRegion } from "./earth-map-query-service";
import { regionInfestation } from "./threat-service";

// ===========================================
// Queries
// ===========================================

/** The hive rooted in `regionId`, or `undefined` when the region has none. */
export function hiveInRegion(
  overworld: Pick<OverworldState, "hives">,
  regionId: RegionId,
): Hive | undefined {
  return overworld.hives.find((hive) => hive.regionId === regionId);
}

/** Every region that holds a hive. Empty until the first hive forms. */
export function hiveRegionIds(
  overworld: Pick<OverworldState, "hives">,
): ReadonlySet<RegionId> {
  return new Set(overworld.hives.map((hive) => hive.regionId));
}

// ===========================================
// Formation
// ===========================================

/**
 * Roots a hive in `regionId` on `day` (campaign arc §6.5) and announces
 * it with `HiveFormed`. The new hive's id is drawn from `ids` with the
 * `"hive"` prefix, and the region's formation streak in `hiveWatch` is
 * cleared, since a region with a hive keeps none.
 *
 * Idempotent per region: a region that already holds a hive keeps it,
 * and the input is returned by identity with no events and no id drawn.
 *
 * ```
 *   hive in region? ──yes──► unchanged
 *        │no
 *   hives + { id: nextId("hive"), regionId, formedDay: day }
 *   hiveWatch − regionId        events: [HiveFormed]
 * ```
 *
 * @throws {RangeError} if `regionId` is not on the map: a programmer
 *   error in the calling rule, not a game state.
 */
export function formHive(
  overworld: OverworldState,
  regionId: RegionId,
  day: number,
  ids: IdGenerator,
): OverworldApplied<OverworldState> {
  if (findRegion(overworld.map, regionId) === undefined) {
    throw new RangeError(
      `Cannot form a hive in unknown region "${regionId}"; it must be a region id`,
    );
  }
  if (hiveInRegion(overworld, regionId) !== undefined) {
    return { state: overworld, events: [] };
  }
  const hive: Hive = {
    id: ids.nextId(HIVE_ID_PREFIX),
    regionId,
    formedDay: day,
  };
  const { hiveWatch: _cleared, ...rest } = overworld;
  const watch = withoutKey(overworld.hiveWatch, regionId);
  return {
    state: {
      ...rest,
      ...(watch === undefined ? {} : { hiveWatch: watch }),
      hives: [...overworld.hives, hive],
    },
    events: [{ type: HIVE_FORMED, payload: { hive } }],
  };
}

/**
 * The scripted first hive when Act II opens (arc §6.5: "the first hive
 * is scripted when Act II opens, in the worst region"): forms a hive in
 * the region with the highest mean infestation among those without one,
 * ties going to the region that comes first in map order. Returns the
 * input by identity when every region already holds a hive.
 *
 * Each call forms one more hive, so the story rule that opens Act II
 * calls it exactly once.
 */
export function formFirstHive(
  overworld: OverworldState,
  day: number,
  ids: IdGenerator,
): OverworldApplied<OverworldState> {
  let worst: { readonly regionId: RegionId; readonly mean: number } | undefined;
  for (const region of overworld.map.regions) {
    if (hiveInRegion(overworld, region.id) !== undefined) {
      continue;
    }
    const mean = regionInfestation(overworld.map, region.id);
    if (worst === undefined || mean > worst.mean) {
      worst = { regionId: region.id, mean };
    }
  }
  if (worst === undefined) {
    return { state: overworld, events: [] };
  }
  return formHive(overworld, worst.regionId, day, ids);
}

// ===========================================
// Liberation
// ===========================================

/**
 * Liberates the region of hive `hiveId` (arc §6.5, the Hive Assault's
 * pay-off): the hive is removed, every city in its region drops by
 * `liberationCut` (clamped at zero, one `CityInfestationChanged` per city
 * that moved), and the region's growth pauses for
 * `liberationGrowthPauseDays` days, counted from the day after `day`.
 *
 * ```
 *   hive?  ──no──► unchanged (already liberated)
 *     │yes
 *   hives − hive
 *   each city in its region: to = max(0, from − liberationCut)
 *   growthPausedUntil[region] = day + liberationGrowthPauseDays + 1
 * ```
 *
 * A hive id that is not standing (a repeated consequence, a stale
 * mission) changes nothing and returns the input by identity.
 */
export function liberateRegion(
  overworld: OverworldState,
  hiveId: HiveId,
  day: number,
  tuning: Pick<HiveTuning, "liberationCut" | "liberationGrowthPauseDays">,
): OverworldApplied<OverworldState> {
  const hive = overworld.hives.find((h) => h.id === hiveId);
  if (hive === undefined) {
    return { state: overworld, events: [] };
  }
  const events: CityInfestationChangedEvent[] = [];
  const cities = overworld.map.cities.map((city): City => {
    if (city.regionId !== hive.regionId) {
      return city;
    }
    const to = clampInfestation(city.infestation - tuning.liberationCut);
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
      ...overworld,
      map: { ...overworld.map, cities },
      hives: overworld.hives.filter((h) => h.id !== hiveId),
      growthPausedUntil: {
        ...overworld.growthPausedUntil,
        [hive.regionId]: day + tuning.liberationGrowthPauseDays + 1,
      },
    },
    events,
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * `record` without `key`, or `undefined` when nothing is left, so an
 * optional record field is dropped rather than stored empty.
 */
function withoutKey(
  record: Readonly<Record<RegionId, number>> | undefined,
  key: RegionId,
): Readonly<Record<RegionId, number>> | undefined {
  if (record === undefined) {
    return undefined;
  }
  const { [key]: _removed, ...rest } = record;
  return Object.keys(rest).length === 0 ? undefined : rest;
}
