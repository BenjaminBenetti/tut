import type { RosterTuning } from "../model/roster-tuning";
import { RANK_TUNING } from "./rank-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The default roster tuning, for injection into the repair and casualty
 * services. Placeholders until the overworld loop is played end to end.
 */
export const ROSTER_TUNING: RosterTuning = {
  /**
   * A full repair of a maximally damaged mech costs 100 × this, roughly
   * a third of the starter mech's price, so repairing beats rebuilding
   * but is not free.
   */
  repairCostPerPoint: 10,
  /**
   * Flat per mission, on top of what the kills were worth: half a
   * swarmer, so a quiet mission still counts for something but the
   * first rung (10) is earned by a kill, not by coming home once.
   */
  xpPerMissionSurvived: 5,
  ranks: RANK_TUNING,
};
