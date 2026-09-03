import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Interact
// ===========================================

/** Command type: a unit works an objective in reach (GDD §6.2). */
export const INTERACT = "tactical:interact";

/** Payload of `Interact`. */
export interface InteractPayload {
  readonly unitId: UnitId;
  /** The objective the unit acts on; must be in reach per the objective rules. */
  readonly objectiveId: string;
}

/** Spends an action on an objective, such as planting charges on an egg spawner. */
export type InteractCommand = Command<typeof INTERACT, InteractPayload>;

/** Builds a `Interact` command. */
export function interact(unitId: UnitId, objectiveId: string): InteractCommand {
  return { type: INTERACT, payload: { unitId, objectiveId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [INTERACT]: InteractCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [INTERACT]: InteractCommand;
  }
}
