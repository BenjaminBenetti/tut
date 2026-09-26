import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { MissionCampaignState } from "./mission-campaign-state";
import type { TacticalError } from "./tactical-error";

// ===========================================
// Stage advancer
// ===========================================

/**
 * Moves a linked mission on from a won stage to the next (ADR 0013
 * amendment, #1179). `TacticalMissionResolver` satisfies it; the
 * `AdvanceStage` handler depends on this alone, as `StartMission`
 * depends on `MissionStarter`.
 *
 * ```
 *   stage won, another after ──► AdvanceStage ──► advanceStage ──► next stage in activeMission
 * ```
 */
export interface StageAdvancer {
  /**
   * Builds the next stage's map, stands the survivors on it as they
   * are, and returns the campaign with it in `activeMission`, or why
   * the mission cannot move on.
   */
  advanceStage<TState extends MissionCampaignState>(
    state: TState,
    ids: IdGenerator,
  ): Result<TState, TacticalError>;
}
