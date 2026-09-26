import type { HiveId } from "./hive";
import type { RegionId } from "./region";

// ===========================================
// Hive assault spec
// ===========================================

/**
 * What a Hive Assault offer is assaulting (campaign arc §6.5): the hive,
 * the region its fall liberates, and the hive's level on the day the
 * offer was last priced. Present exactly when the mission's `typeId` is
 * `"hive-assault"`; every other offer, and every older save's offers,
 * has none.
 *
 * ```
 *   Hive { id: "hive-1", regionId: "east", formedDay: 30 }
 *     day 44 ──► Mission.hive = { hiveId: "hive-1", regionId: "east", level: 2 }
 * ```
 *
 * The level is re-derived every day the offer stands (the trigger's
 * `refresh`), so the offer the player finally launches carries the
 * level of the day it was launched. Tactical setup scales the core's
 * hit points, the guards and the nests from it.
 */
export interface HiveAssaultSpec {
  /** The hive the mission destroys; its id in `OverworldState.hives`. */
  readonly hiveId: HiveId;
  /** The region a win liberates: the hive's own region. */
  readonly regionId: RegionId;
  /**
   * `hiveLevel(hive, day, tuning)` on the day the offer was last priced;
   * for a Great Hive, the levels its lost assaults have added.
   */
  readonly level: number;
  /**
   * Set on a Great Hive's assault (arc §6.9): `hiveId` then names a
   * `GreatHive` in `OverworldState.greatHives`, `regionId` its seat, and
   * the mission is oversized — a larger cavern with more chambers, a
   * tougher core and more guards. Absent on an ordinary Hive Assault.
   */
  readonly great?: true;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether `mission` assaults a Great Hive rather than an ordinary hive.
 * Every table entry that treats the two differently asks this one
 * question.
 */
export function isGreatHiveAssault(mission: {
  readonly hive?: HiveAssaultSpec;
}): boolean {
  return mission.hive?.great === true;
}
