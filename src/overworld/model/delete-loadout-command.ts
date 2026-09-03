import type { Command } from "../../core/model/command";

// ===========================================
// Delete loadout
// ===========================================

/** Command type that removes a saved loadout template. */
export const DELETE_LOADOUT = "roster:delete-loadout";

/** The template name to delete. */
export interface DeleteLoadoutPayload {
  readonly name: string;
}

/** Deletes a loadout template; built mechs keep their own copy. */
export type DeleteLoadoutCommand = Command<
  typeof DELETE_LOADOUT,
  DeleteLoadoutPayload
>;

/** Builds a `DeleteLoadout` command. */
export function deleteLoadout(name: string): DeleteLoadoutCommand {
  return { type: DELETE_LOADOUT, payload: { name } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [DELETE_LOADOUT]: DeleteLoadoutCommand;
  }
}
