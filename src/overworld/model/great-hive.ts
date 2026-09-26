import type { ContinentId } from "./continent";
import type { MissionId } from "./mission";
import type { OverworldState } from "./overworld-state";
import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/** Id of a Great Hive, e.g. `"greathive-2"`. Plain string (ADR 0003). */
export type GreatHiveId = string;

/** Prefix the id generator uses for Great Hives; it refuses a hyphen, hence one word. */
export const GREAT_HIVE_ID_PREFIX = "greathive";

// ===========================================
// Great Hive
// ===========================================

/**
 * One of the Spore Platform's three beacons (campaign arc §3 Act III,
 * §6.9): a Great Hive revealed on a continent when Uplink is won, and
 * assaulted through a pinned, oversized Hive Assault.
 *
 * Kept in its own list, `OverworldState.greatHives`, not among the
 * ordinary `hives`: the ordinary rules key on `hives` — the spread
 * multiplier on a hive's region, formation's one-per-region rule, the
 * weekly level, the pinned trigger and its daily re-pricing, and
 * `liberateRegion` — and none of them should see a beacon. A Great
 * Hive's level moves only on a lost assault, and it covers a whole
 * continent rather than one region.
 *
 * ```
 *   GreatHive { id: "greathive-1", continentId: "europe", name: "Europe",
 *               regionId: "eastern-europe", regionIds: [4 regions],
 *               revealedDay: 212, level: 0 }
 *     lost    ──► level 1, retryDay = day + STORY_RETRY_DAYS
 *     won     ──► destroyedDay = day; the continent is liberated
 * ```
 *
 * A destroyed Great Hive stays in the list with its `destroyedDay`, so
 * the tracker can count "Great Hives 2 / 3" and the flag can tell when
 * the third falls.
 */
export interface GreatHive {
  /** Unique within the campaign. */
  readonly id: GreatHiveId;
  /** The continent it sits on. */
  readonly continentId: ContinentId;
  /** The continent's name, frozen at the reveal so the screens need no catalogue. */
  readonly name: string;
  /** The seat: the region its assault is offered in, the continent's most infested at the reveal. */
  readonly regionId: RegionId;
  /** Every region of its continent; a win liberates them all. */
  readonly regionIds: readonly RegionId[];
  /** The day Uplink's tracking data revealed it. */
  readonly revealedDay: number;
  /** Levels gained from lost assaults: 0 at the reveal, capped by `GreatHiveTuning.maxLevel`. */
  readonly level: number;
  /** After a lost assault, the first day its offer is pinned again. */
  readonly retryDay?: number;
  /** The day its core fell. Absent while it stands. */
  readonly destroyedDay?: number;
  /**
   * The last assault resolved against it, won or lost: how the debrief
   * tells a Great Hive's result from an ordinary Hive Assault's, since a
   * result carries no hive id.
   */
  readonly lastAssaultId?: MissionId;
}

// ===========================================
// Queries
// ===========================================

/** Whether `hive` still stands: its core has not fallen. */
export function isGreatHiveStanding(hive: GreatHive): boolean {
  return hive.destroyedDay === undefined;
}

/**
 * The Great Hive tally for the tracker and the briefing, or `undefined`
 * before the reveal.
 *
 * ```
 *   no greatHives         ──► undefined
 *   three, one destroyed  ──► { destroyed: 1, total: 3 }
 * ```
 */
export function greatHiveTally(
  overworld: Pick<OverworldState, "greatHives">,
): { readonly destroyed: number; readonly total: number } | undefined {
  const hives = overworld.greatHives;
  if (hives === undefined) {
    return undefined;
  }
  const destroyed = hives.filter((hive) => !isGreatHiveStanding(hive)).length;
  return { destroyed, total: hives.length };
}

/**
 * The Great Hive whose last resolved assault was `missionId`, or
 * `undefined` when that mission assaulted none.
 */
export function greatHiveAssaultedBy(
  overworld: Pick<OverworldState, "greatHives">,
  missionId: MissionId,
): GreatHive | undefined {
  return overworld.greatHives?.find((hive) => hive.lastAssaultId === missionId);
}

/** The Great Hive with id `id`, or `undefined` when there is none. */
export function findGreatHive(
  overworld: Pick<OverworldState, "greatHives">,
  id: GreatHiveId,
): GreatHive | undefined {
  return overworld.greatHives?.find((hive) => hive.id === id);
}
