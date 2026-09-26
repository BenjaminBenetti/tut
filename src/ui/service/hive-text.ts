import type { HiveTuning } from "../../overworld/model/hive-tuning";
import { hiveLevel } from "../../overworld/model/hive";
import type { OverworldState } from "../../overworld/model/overworld-state";
import type { RegionId } from "../../overworld/model/region";
import { hiveInRegion } from "../../overworld/service/hive-service";

// ===========================================
// Types
// ===========================================

/** What the region panel says about a region's hive. */
export interface HiveText {
  /** The line itself: `Hive (level 2)`. */
  readonly label: string;
  /** The longer note for its tooltip. */
  readonly detail: string;
}

// ===========================================
// Hive text
// ===========================================

/**
 * The hive line for `regionId` on the overworld's current day, or
 * `undefined` when the region holds no hive (campaign arc §6.5). The
 * level is derived from the hive's age, as the Hive Assault will read
 * it, so the panel and the mission can never disagree.
 *
 * ```
 *   no hive                        ──► undefined
 *   formed day 30, today day 44    ──► { label: "Hive (level 2)",
 *                                        detail: "Formed on day 30. Gains a level every 7 days." }
 * ```
 */
export function hiveText(
  overworld: Pick<OverworldState, "hives" | "day">,
  regionId: RegionId,
  tuning: Pick<HiveTuning, "difficultyStepDays">,
): HiveText | undefined {
  const hive = hiveInRegion(overworld, regionId);
  if (hive === undefined) {
    return undefined;
  }
  const level = hiveLevel(hive, overworld.day, tuning);
  return {
    label: `Hive (level ${String(level)})`,
    detail: `Formed on day ${String(hive.formedDay)}. Gains a level every ${String(tuning.difficultyStepDays)} days.`,
  };
}
