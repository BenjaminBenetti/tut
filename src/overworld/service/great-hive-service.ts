import type { CampaignFlagId } from "../../content/model/campaign-flag-id";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import type { CampaignEvent } from "../model/campaign-event";
import type { Continent, ContinentCatalogue } from "../model/continent";
import { CONTINENT_IDS } from "../model/continent";
import type { EarthMap } from "../model/earth-map";
import type { GreatHive, GreatHiveId } from "../model/great-hive";
import {
  findGreatHive,
  GREAT_HIVE_ID_PREFIX,
  greatHiveTally,
  isGreatHiveStanding,
} from "../model/great-hive";
import { GREAT_HIVE_DESTROYED } from "../model/great-hive-destroyed-event";
import type { GreatHiveTuning } from "../model/great-hive-tuning";
import { GREAT_HIVES_REVEALED } from "../model/great-hives-revealed-event";
import type { HiveTuning } from "../model/hive-tuning";
import type { MissionId } from "../model/mission";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import { STORY_RETRY_DAYS } from "../model/story-mission-rule";
import { hasFlag } from "./campaign-progress-service";
import { findRegion } from "./earth-map-query-service";
import { hiveRegionIds, liberateRegionCities } from "./hive-service";
import { UPLINK_WON_FLAG } from "./story/uplink";
import { setCampaignFlag } from "./story-service";
import { regionInfestation } from "./threat-service";

// ===========================================
// Constants
// ===========================================

/**
 * The flag the third Great Hive's fall sets (arc §3: Act III ends when
 * all three are destroyed and Intel III is researched). With
 * `platform-approach` it pins Launch Window.
 */
export const GREAT_HIVES_DESTROYED_FLAG: CampaignFlagId =
  "great-hives-destroyed";

// ===========================================
// Types
// ===========================================

/** What the reveal draws from: the continent grouping and how many to place. */
export interface GreatHiveRevealDeps {
  readonly continents: ContinentCatalogue;
  readonly tuning: Pick<GreatHiveTuning, "count">;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether the Great Hive's assault may be pinned on `day`: it stands, the
 * campaign is in its act, and no lost assault holds it back.
 *
 * ```
 *   standing ∧ act = tuning.act ∧ (no retryDay ∨ day ≥ retryDay)
 * ```
 */
export function isGreatHiveDue(
  hive: GreatHive,
  state: Pick<OverworldState, "day" | "progress">,
  tuning: Pick<GreatHiveTuning, "act">,
): boolean {
  return (
    isGreatHiveStanding(hive) &&
    state.progress.act === tuning.act &&
    (hive.retryDay === undefined || state.day >= hive.retryDay)
  );
}

// ===========================================
// The reveal
// ===========================================

/**
 * Reveals the Great Hives once Uplink is won (campaign arc §3 Act III,
 * §6.9): `tuning.count` Great Hives, each on its own continent, seated in
 * the continent's most infested region, announced by one
 * `GreatHivesRevealed`. Ids come from `ids` with the `"greathive"`
 * prefix.
 *
 * ```
 *   greatHives already set ──► unchanged (revealed once, ever)
 *   uplink-won not held    ──► unchanged
 *   continents = chooseGreatHiveContinents(count, rng)
 *   greatHives = one per continent, level 0, revealedDay = day
 *                                              events: [GreatHivesRevealed]
 * ```
 */
export function revealGreatHives(
  overworld: OverworldState,
  day: number,
  rng: Rng,
  ids: IdGenerator,
  deps: GreatHiveRevealDeps,
): OverworldApplied<OverworldState> {
  if (
    overworld.greatHives !== undefined ||
    !hasFlag(overworld.progress, UPLINK_WON_FLAG)
  ) {
    return { state: overworld, events: [] };
  }
  const chosen = chooseGreatHiveContinents(
    overworld,
    deps.continents,
    deps.tuning.count,
    rng,
  );
  const greatHives = chosen.map((continent): GreatHive => ({
    id: ids.nextId(GREAT_HIVE_ID_PREFIX),
    continentId: continent.id,
    name: continent.name,
    regionId: seatRegionOf(overworld.map, continent.regionIds),
    regionIds: continent.regionIds,
    revealedDay: day,
    level: 0,
  }));
  return {
    state: { ...overworld, greatHives },
    events: [{ type: GREAT_HIVES_REVEALED, payload: { greatHives } }],
  };
}

/**
 * The `count` continents the Great Hives are revealed on, drawn from
 * `rng`: continents holding no ordinary hive first, shuffled, then the
 * rest, shuffled, so the beacons open new fronts where they can and fall
 * back to any continent where they cannot. The chosen continents are
 * returned in map order (`CONTINENT_IDS`), and only regions on the map
 * count, so a continent with none is never chosen.
 *
 * ```
 *   free  = continents with no hive in any region    shuffle
 *   taken = continents with a hive                   shuffle
 *   chosen = (free ++ taken).slice(0, count), sorted into map order
 * ```
 *
 * Both lists are always shuffled, so the draws are the same whatever
 * the split.
 *
 * @throws {RangeError} if fewer than `count` continents are on the map.
 */
export function chooseGreatHiveContinents(
  overworld: Pick<OverworldState, "map" | "hives">,
  continents: ContinentCatalogue,
  count: number,
  rng: Rng,
): Continent[] {
  const held = hiveRegionIds(overworld);
  const onMap = CONTINENT_IDS.map((id) =>
    withRegionsOnMap(overworld.map, continents[id]),
  ).filter((continent) => continent.regionIds.length > 0);
  if (onMap.length < count) {
    throw new RangeError(
      `Cannot reveal ${String(count)} Great Hives on ${String(onMap.length)} continents`,
    );
  }
  const hasHive = (continent: Continent): boolean =>
    continent.regionIds.some((regionId) => held.has(regionId));
  const free = rng.shuffle(onMap.filter((c) => !hasHive(c)));
  const taken = rng.shuffle(onMap.filter(hasHive));
  const chosen = new Set([...free, ...taken].slice(0, count));
  return onMap.filter((continent) => chosen.has(continent));
}

// ===========================================
// Consequences
// ===========================================

/**
 * A won Great Hive assault (campaign arc §6.9): the Great Hive is marked
 * destroyed and every region of its continent liberated with the
 * ordinary liberation (`liberateRegionCities`: the cut and the growth
 * pause). Ordinary hives on the continent stand; their own assaults
 * remove them. The third to fall sets `great-hives-destroyed`.
 *
 * ```
 *   standing? ──no──► unchanged (a replayed consequence)
 *     │yes
 *   destroyedDay = day
 *   each region of the continent: cities − liberationCut,     CityInfestationChanged × n
 *     growth paused liberationGrowthPauseDays
 *                                                            GreatHiveDestroyed { N / total }
 *   N = total ──► setCampaignFlag("great-hives-destroyed")  CampaignFlagSet
 * ```
 */
export function destroyGreatHive(
  overworld: OverworldState,
  id: GreatHiveId,
  day: number,
  tuning: Pick<HiveTuning, "liberationCut" | "liberationGrowthPauseDays">,
): OverworldApplied<OverworldState> {
  const hive = findGreatHive(overworld, id);
  if (hive === undefined || !isGreatHiveStanding(hive)) {
    return { state: overworld, events: [] };
  }
  let state: OverworldState = withGreatHive(overworld, {
    ...hive,
    destroyedDay: day,
  });
  const events: CampaignEvent[] = [];
  for (const regionId of hive.regionIds) {
    if (findRegion(state.map, regionId) === undefined) {
      continue;
    }
    const liberated = liberateRegionCities(state, regionId, day, tuning);
    state = liberated.state;
    events.push(...liberated.events);
  }
  const tally = greatHiveTally(state) ?? { destroyed: 0, total: 0 };
  events.push({
    type: GREAT_HIVE_DESTROYED,
    payload: {
      greatHiveId: hive.id,
      continentId: hive.continentId,
      name: hive.name,
      regionIds: hive.regionIds,
      pausedUntilDay: day + tuning.liberationGrowthPauseDays + 1,
      destroyed: tally.destroyed,
      total: tally.total,
    },
  });
  if (tally.destroyed < tally.total) {
    return { state, events };
  }
  const flagged = setCampaignFlag(state, GREAT_HIVES_DESTROYED_FLAG);
  return { state: flagged.state, events: [...events, ...flagged.events] };
}

/**
 * A lost, abandoned or extracted Great Hive assault: the Great Hive
 * stands, gains one level up to `maxLevel`, and its offer is held back
 * `STORY_RETRY_DAYS` days, as a lost story mission's is.
 *
 * ```
 *   level     = min(level + 1, maxLevel)
 *   retryDay  = day + STORY_RETRY_DAYS
 * ```
 *
 * A Great Hive that is gone or already destroyed changes nothing.
 */
export function recordGreatHiveDefeat(
  overworld: OverworldState,
  id: GreatHiveId,
  day: number,
  tuning: Pick<GreatHiveTuning, "maxLevel">,
): OverworldState {
  const hive = findGreatHive(overworld, id);
  if (hive === undefined || !isGreatHiveStanding(hive)) {
    return overworld;
  }
  return withGreatHive(overworld, {
    ...hive,
    level: Math.min(hive.level + 1, tuning.maxLevel),
    retryDay: day + STORY_RETRY_DAYS,
  });
}

/**
 * `overworld` with the Great Hive `id` recording `missionId` as the last
 * assault resolved against it (`GreatHive.lastAssaultId`); unchanged
 * when there is no such Great Hive.
 *
 * @param overworld - The campaign after the assault's consequence.
 * @param id - The Great Hive assaulted.
 * @param missionId - The assault resolved.
 */
export function stampGreatHiveAssault(
  overworld: OverworldState,
  id: GreatHiveId,
  missionId: MissionId,
): OverworldState {
  const hive = findGreatHive(overworld, id);
  return hive === undefined
    ? overworld
    : withGreatHive(overworld, { ...hive, lastAssaultId: missionId });
}

// ===========================================
// Helpers
// ===========================================

/**
 * The seat of a Great Hive: the region of `regionIds` with the highest
 * mean infestation, ties going to the first in the list (map order).
 */
function seatRegionOf(map: EarthMap, regionIds: readonly RegionId[]): RegionId {
  let seat: { readonly regionId: RegionId; readonly mean: number } | undefined;
  for (const regionId of regionIds) {
    const mean = regionInfestation(map, regionId);
    if (seat === undefined || mean > seat.mean) {
      seat = { regionId, mean };
    }
  }
  if (seat === undefined) {
    throw new RangeError("A Great Hive needs at least one region on the map");
  }
  return seat.regionId;
}

/** `continent` with only the regions that are on `map`. */
function withRegionsOnMap(map: EarthMap, continent: Continent): Continent {
  return {
    ...continent,
    regionIds: continent.regionIds.filter(
      (regionId) => findRegion(map, regionId) !== undefined,
    ),
  };
}

/** The overworld with the Great Hive of the same id replaced by `hive`. */
function withGreatHive(
  overworld: OverworldState,
  hive: GreatHive,
): OverworldState {
  return {
    ...overworld,
    greatHives: (overworld.greatHives ?? []).map((candidate) =>
      candidate.id === hive.id ? hive : candidate,
    ),
  };
}
