import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Burrow
// ===========================================

/** Command type: a surfaced burrower digs back down where it stands (#1179). */
export const BURROW = "tactical:burrow";

/** Payload of `Burrow`. */
export interface BurrowPayload {
  readonly unitId: UnitId;
}

/** Takes a burrower back under the ground, for `BurrowTuning.burrowApCost`, once its cooldown has run. */
export type BurrowCommand = Command<typeof BURROW, BurrowPayload>;

/** Builds a `Burrow` command. */
export function burrow(unitId: UnitId): BurrowCommand {
  return { type: BURROW, payload: { unitId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [BURROW]: BurrowCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [BURROW]: BurrowCommand;
  }
}
