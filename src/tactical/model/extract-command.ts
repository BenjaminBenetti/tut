import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Extract
// ===========================================

/** Command type: a unit standing on the extraction zone leaves the map (GDD §6.2). */
export const EXTRACT = "tactical:extract";

/** Payload of `Extract`. */
export interface ExtractPayload {
  readonly unitId: UnitId;
}

/** Removes a unit at an extraction tile from the fight; the mission ends when every survivor is out. */
export type ExtractCommand = Command<typeof EXTRACT, ExtractPayload>;

/** Builds a `Extract` command. */
export function extract(unitId: UnitId): ExtractCommand {
  return { type: EXTRACT, payload: { unitId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [EXTRACT]: ExtractCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [EXTRACT]: ExtractCommand;
  }
}
