import type { Command } from "../../core/model/command";
import type { Deployment } from "./deployment";
import type { MissionId } from "./mission";

// ===========================================
// Launch mission
// ===========================================

/** Command type that launches an offered mission with a chosen deployment (GDD §4). */
export const LAUNCH_MISSION = "overworld:launch-mission";

/** Which mission, and who goes. `deployment.missionId` must match `missionId`. */
export interface LaunchMissionPayload {
  readonly missionId: MissionId;
  readonly deployment: Deployment;
}

/**
 * Resolves a mission through the injected `MissionResolver` and applies
 * its result across roster, economy and map. Time does not advance here;
 * the player continues from the results screen with `AdvanceDay`.
 */
export type LaunchMissionCommand = Command<
  typeof LAUNCH_MISSION,
  LaunchMissionPayload
>;

/** Builds a `LaunchMission` command. */
export function launchMission(
  missionId: MissionId,
  deployment: Deployment,
): LaunchMissionCommand {
  return { type: LAUNCH_MISSION, payload: { missionId, deployment } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [LAUNCH_MISSION]: LaunchMissionCommand;
  }
}
