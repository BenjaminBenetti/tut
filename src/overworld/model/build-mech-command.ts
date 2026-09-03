import type { Command } from "../../core/model/command";

// ===========================================
// Build mech
// ===========================================

/** Command type that builds a mech from a saved template (GDD §5.8). */
export const BUILD_MECH = "roster:build-mech";

/** Which template to build and what to call the mech. */
export interface BuildMechPayload {
  readonly loadoutName: string;
  readonly mechName: string;
}

/** Validates and buys a mech from a saved loadout. */
export type BuildMechCommand = Command<typeof BUILD_MECH, BuildMechPayload>;

/** Builds a `BuildMech` command. */
export function buildMech(
  loadoutName: string,
  mechName: string,
): BuildMechCommand {
  return { type: BUILD_MECH, payload: { loadoutName, mechName } };
}

// ===========================================
// Registration
// ===========================================

declare module "./overworld-command" {
  interface OverworldCommandMap {
    [BUILD_MECH]: BuildMechCommand;
  }
}
