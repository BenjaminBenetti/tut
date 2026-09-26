import type { HiveTuning } from "./hive-tuning";
import type { RegionId } from "./region";

// ===========================================
// Ids
// ===========================================

/** Id of a bug hive, e.g. `"hive-2"`. Plain string (ADR 0003). */
export type HiveId = string;

/** Prefix the id generator uses for hives. */
export const HIVE_ID_PREFIX = "hive";

// ===========================================
// Hive
// ===========================================

/**
 * A bug hive rooted in a region (campaign arc §6.5). Lives in
 * `OverworldState.hives`, at most one per region, from the day it forms
 * until a Hive Assault liberates the region. While it stands, its
 * region's cities spread faster (`InfestationTuning.hiveSpreadMultiplier`),
 * and it grows harder to assault: its level is derived from its age by
 * `hiveLevel`, never stored.
 *
 * ```
 *   Hive { id: "hive-1", regionId: "east-asia", formedDay: 30 }
 *     day 30 ──► level 0     day 37 ──► level 1     day 44 ──► level 2
 * ```
 */
export interface Hive {
  /** Unique within the campaign. */
  readonly id: HiveId;
  /** The region the hive is rooted in. */
  readonly regionId: RegionId;
  /** The day the hive formed. */
  readonly formedDay: number;
}

// ===========================================
// Level
// ===========================================

/**
 * A hive's difficulty level on `day` (arc §6.5: "the hive gains a
 * difficulty step every 7 days"): 0 on the day it forms, one more every
 * `difficultyStepDays` after. Never negative, so a day before
 * `formedDay` reads 0.
 *
 * ```
 *   level = max(0, floor((day − formedDay) / difficultyStepDays))
 * ```
 */
export function hiveLevel(
  hive: Hive,
  day: number,
  tuning: Pick<HiveTuning, "difficultyStepDays">,
): number {
  const age = day - hive.formedDay;
  return Math.max(0, Math.floor(age / tuning.difficultyStepDays));
}
