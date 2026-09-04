import type { Command } from "../../core/model/command";
import type { Deployment } from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// StartMission
// ===========================================

/** Command type: the chosen force deploys and the mission begins (GDD §6). */
export const START_MISSION = "tactical:start-mission";

/** Which mission, and who goes. `deployment.missionId` must match `missionId`. */
export interface StartMissionPayload {
  readonly missionId: MissionId;
  readonly deployment: Deployment;
}

/**
 * Generates the mission's map, places the deployment and puts the
 * resulting `TacticalState` in `activeMission` (#323). The mission stays
 * on offer until `FinishMission` resolves it, so a campaign is never left
 * with a mission that is neither offered nor in progress.
 */
export type StartMissionCommand = Command<
  typeof START_MISSION,
  StartMissionPayload
>;

/** Builds a `StartMission` command. */
export function startMission(
  missionId: MissionId,
  deployment: Deployment,
): StartMissionCommand {
  return { type: START_MISSION, payload: { missionId, deployment } };
}

// ===========================================
// Registration
// ===========================================
//
// Only into `OverworldCommandMap`: this is a campaign-level command that
// *creates* `activeMission` rather than a rule that runs inside one, so
// it is not lifted by `liftTacticalHandler` and is not a member of
// `TacticalCommand` (which the HUD dispatches from).

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [START_MISSION]: StartMissionCommand;
  }
}
