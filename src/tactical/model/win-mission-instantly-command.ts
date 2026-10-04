import type { Command } from "../../core/model/command";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// WinMissionInstantly
// ===========================================

/**
 * Command type: the dev build's instant win (#1235). An offer is settled
 * as won on the spot, without a map, so a tester can reach the later
 * missions without playing the earlier ones. A development tool: the
 * handler refuses it outside a dev build.
 */
export const WIN_MISSION_INSTANTLY = "tactical:win-mission-instantly";

/** Which offer. The handler decides who counts as deployed. */
export interface WinMissionInstantlyPayload {
  readonly missionId: MissionId;
}

/**
 * Resolves the offer as won through `LaunchMission` over the instant-win
 * resolver, so its rewards, its consequences and the story apply as for
 * a win on the map. Time does not advance; the debrief's Continue does.
 */
export type WinMissionInstantlyCommand = Command<
  typeof WIN_MISSION_INSTANTLY,
  WinMissionInstantlyPayload
>;

/** Builds a `WinMissionInstantly` command. */
export function winMissionInstantly(
  missionId: MissionId,
): WinMissionInstantlyCommand {
  return { type: WIN_MISSION_INSTANTLY, payload: { missionId } };
}

// ===========================================
// Registration
// ===========================================
//
// Only into `OverworldCommandMap`, like `StartMission` and
// `FinishMission`: it settles an offer between missions rather than
// acting inside one.

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [WIN_MISSION_INSTANTLY]: WinMissionInstantlyCommand;
  }
}
