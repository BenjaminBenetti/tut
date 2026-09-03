import type { Command } from "../../core/model/command";
import type { MechId } from "../../roster/model/mech";

// ===========================================
// Rename mech
// ===========================================

/** Command type that renames an owned mech (GDD §5.7). */
export const RENAME_MECH = "roster:rename-mech";

/** Which mech and its new player-facing name. */
export interface RenameMechPayload {
  readonly mechId: MechId;
  readonly name: string;
}

/** Renames a mech; free. */
export type RenameMechCommand = Command<typeof RENAME_MECH, RenameMechPayload>;

/** Builds a `RenameMech` command. */
export function renameMech(mechId: MechId, name: string): RenameMechCommand {
  return { type: RENAME_MECH, payload: { mechId, name } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [RENAME_MECH]: RenameMechCommand;
  }
}
