import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Overwatch
// ===========================================

/** Command type: a unit spends its remaining actions to fire on the first bug that moves in sight (GDD §6.2). */
export const OVERWATCH = "tactical:overwatch";

/** Payload of `Overwatch`. */
export interface OverwatchPayload {
  readonly unitId: UnitId;
}

/** Puts a unit on overwatch until its next turn. */
export type OverwatchCommand = Command<typeof OVERWATCH, OverwatchPayload>;

/** Builds a `Overwatch` command. */
export function overwatch(unitId: UnitId): OverwatchCommand {
  return { type: OVERWATCH, payload: { unitId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [OVERWATCH]: OverwatchCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [OVERWATCH]: OverwatchCommand;
  }
}
