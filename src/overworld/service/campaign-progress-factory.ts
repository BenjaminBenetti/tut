import type { CampaignProgress } from "../model/campaign-progress";

// ===========================================
// Factory
// ===========================================

/**
 * Builds the progress a new campaign starts with (ADR 0013 §2.1): Act I,
 * begun before the first mission, nothing played, won, earned, killed or
 * remembered yet.
 *
 * ```
 *   { act: "act-1", actStartedAt: 0, missionsPlayed: 0, missionsWon: 0,
 *     flags: [], speciesKilled: [], nemeses: [] }
 * ```
 */
export function createInitialCampaignProgress(): CampaignProgress {
  return {
    act: "act-1",
    actStartedAt: 0,
    missionsPlayed: 0,
    missionsWon: 0,
    flags: [],
    speciesKilled: [],
    nemeses: [],
  };
}
