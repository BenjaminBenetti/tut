import type { Command } from "../../core/model/command";

// ===========================================
// EndTurn
// ===========================================

/** Command type: the player ends the turn and the bugs act (GDD §6.2). */
export const END_TURN = "tactical:end-turn";

/** Payload of `EndTurn`. */
export interface EndTurnPayload {
  /** Set when the player ends the turn early with actions left. */
  readonly early?: boolean;
}

/** Hands the turn to the bugs; the bug phase and the next player turn follow (#330). */
export type EndTurnCommand = Command<typeof END_TURN, EndTurnPayload>;

/** Builds a `EndTurn` command. */
export function endTurn(early = false): EndTurnCommand {
  return { type: END_TURN, payload: early ? { early: true } : {} };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [END_TURN]: EndTurnCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [END_TURN]: EndTurnCommand;
  }
}
