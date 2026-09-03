import type { Command } from "../../core/model/command";
import type { SquadId } from "../../roster/model/squad";

// ===========================================
// Reinforce squad
// ===========================================

/** Command type that brings a depleted squad back toward full strength. */
export const REINFORCE_SQUAD = "roster:reinforce-squad";

/** Which squad and how many soldiers to add. */
export interface ReinforceSquadPayload {
  readonly squadId: SquadId;
  /** Positive whole number, at most what the squad is missing. */
  readonly soldiers: number;
}

/** Pays per soldier to reinforce a squad. */
export type ReinforceSquadCommand = Command<
  typeof REINFORCE_SQUAD,
  ReinforceSquadPayload
>;

/** Builds a `ReinforceSquad` command. */
export function reinforceSquad(
  squadId: SquadId,
  soldiers: number,
): ReinforceSquadCommand {
  return { type: REINFORCE_SQUAD, payload: { squadId, soldiers } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [REINFORCE_SQUAD]: ReinforceSquadCommand;
  }
}
