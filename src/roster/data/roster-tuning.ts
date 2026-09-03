import type { RosterTuning } from "../model/roster-tuning";

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
  /** Flat per mission; a rank ladder can be layered on later. */
  xpPerMissionSurvived: 10,
};
