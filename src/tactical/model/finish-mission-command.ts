import type { Command } from "../../core/model/command";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// FinishMission
// ===========================================

/** Command type: the finished mission is resolved and cleared (GDD §6.5). */
export const FINISH_MISSION = "tactical:finish-mission";

/** Payload of `FinishMission`. */
export interface FinishMissionPayload {
  /**
   * The mission expected to be in progress. A mismatch is refused rather
   * than resolving whichever mission happens to be live, so a stale
   * dispatch cannot end the wrong one.
   */
  readonly missionId: MissionId;
}

/**
 * Turns the mission in `activeMission` into a `MissionResult` through
 * `LaunchMission` (#67) and clears the slot, so the campaign comes out of
 * the mission with the result applied and nothing left in progress.
 */
export type FinishMissionCommand = Command<
  typeof FINISH_MISSION,
  FinishMissionPayload
>;

/** Builds a `FinishMission` command. */
export function finishMission(missionId: MissionId): FinishMissionCommand {
  return { type: FINISH_MISSION, payload: { missionId } };
}

// ===========================================
// Registration
// ===========================================
//
// Only into `OverworldCommandMap`, for the same reason as `StartMission`:
// it ends `activeMission` rather than acting inside it.

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [FINISH_MISSION]: FinishMissionCommand;
  }
}
