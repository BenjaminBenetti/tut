import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Reload
// ===========================================

/** Command type: a squad reloads or a mech vents heat (GDD §6.2). */
export const RELOAD = "tactical:reload";

/** Payload of `Reload`. */
export interface ReloadPayload {
  readonly unitId: UnitId;
}

/** Spends an action to restore the unit's weapon or heat budget. */
export type ReloadCommand = Command<typeof RELOAD, ReloadPayload>;

/** Builds a `Reload` command. */
export function reload(unitId: UnitId): ReloadCommand {
  return { type: RELOAD, payload: { unitId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [RELOAD]: ReloadCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [RELOAD]: ReloadCommand;
  }
}
