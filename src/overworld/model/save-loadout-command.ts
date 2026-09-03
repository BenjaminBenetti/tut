import type { Command } from "../../core/model/command";
import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// Save loadout
// ===========================================

/** Command type that saves a validated loadout template by name (GDD §5.8). */
export const SAVE_LOADOUT = "roster:save-loadout";

/** The template to save; its `name` is the key and overwrites a same-named template. */
export interface SaveLoadoutPayload {
  readonly loadout: MechLoadout;
}

/** Saves or replaces a loadout template. */
export type SaveLoadoutCommand = Command<
  typeof SAVE_LOADOUT,
  SaveLoadoutPayload
>;

/** Builds a `SaveLoadout` command. */
export function saveLoadout(loadout: MechLoadout): SaveLoadoutCommand {
  return { type: SAVE_LOADOUT, payload: { loadout } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [SAVE_LOADOUT]: SaveLoadoutCommand;
  }
}
