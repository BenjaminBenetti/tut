import type { ActId } from "../../content/model/act-id";

// ===========================================
// Great Hive tuning
// ===========================================

/**
 * How the three Great Hives are revealed, offered and scaled (campaign
 * arc §3 Act III, §6.9). One object in `MissionTuning.greatHive`, so the
 * reveal step, the pin trigger and the consequence all read it from the
 * tuning they are already handed. Values in
 * `overworld/data/great-hive-tuning.ts`.
 */
export interface GreatHiveTuning {
  /** How many Great Hives the reveal places, each on its own continent. */
  readonly count: number;
  /** Every Great Hive offer's fixed difficulty, as for other story missions. */
  readonly difficulty: number;
  /** The act the offer is frozen at. */
  readonly act: ActId;
  /**
   * Multiplier on an ordinary Hive Assault's tech award at the same
   * difficulty (itself already multiplied by `hiveAssault.techRewardMultiplier`),
   * rounded down.
   */
  readonly techRewardMultiplier: number;
  /** The most levels lost assaults may add; each loss adds one. */
  readonly maxLevel: number;
}
