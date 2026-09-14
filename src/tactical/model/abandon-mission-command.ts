import type { Command } from "../../core/model/command";

// ===========================================
// AbandonMission
// ===========================================

/**
 * Command type: the player leaves the mission where it stands (GDD §6.3,
 * #1132). Every unit not yet aboard the drop ship is left behind and the
 * mission ends at once.
 */
export const ABANDON_MISSION = "tactical:abandon-mission";

/** Payload of `AbandonMission`: nothing to say — the mission is the one in progress. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the command carries no arguments
export interface AbandonMissionPayload {}

/** Leaves the mission: the force still on the map is lost and the outcome is recorded. */
export type AbandonMissionCommand = Command<
  typeof ABANDON_MISSION,
  AbandonMissionPayload
>;

/** Builds an `AbandonMission` command. */
export function abandonMission(): AbandonMissionCommand {
  return { type: ABANDON_MISSION, payload: {} };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [ABANDON_MISSION]: AbandonMissionCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [ABANDON_MISSION]: AbandonMissionCommand;
  }
}
