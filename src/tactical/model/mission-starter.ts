import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { Deployment } from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";
import type { MissionCampaignState } from "./mission-campaign-state";
import type { TacticalError } from "./tactical-error";

// ===========================================
// Mission starter
// ===========================================

/**
 * The half of the M2 resolver that begins a mission (#330):
 * `TacticalMissionResolver` satisfies it, and the `StartMission` handler
 * depends on this rather than on the whole resolver, so starting a
 * mission never drags the resolving half in.
 *
 * ```
 *   StartMission ──► MissionStarter.beginMission ──► state.activeMission
 *   MissionEnded ──► FinishMission ──► LaunchMission ──► MissionResult
 * ```
 */
export interface MissionStarter {
  /**
   * Generates the mission's map, places the deployment and returns the
   * campaign with the mission in `activeMission`, or the reason it
   * cannot be started.
   */
  beginMission<TState extends MissionCampaignState>(
    state: TState,
    missionId: MissionId,
    deployment: Deployment,
    ids: IdGenerator,
  ): Result<TState, TacticalError>;
}
