import type { Command } from "../../core/model/command";
import type { UnitId } from "./unit";

// ===========================================
// Surface
// ===========================================

/** Command type: a burrowed unit comes up onto the tile above it (#1179). */
export const SURFACE = "tactical:surface";

/** Payload of `Surface`. */
export interface SurfacePayload {
  readonly unitId: UnitId;
}

/** Brings a burrowed unit up where it is, for `BurrowTuning.surfaceApCost`. */
export type SurfaceCommand = Command<typeof SURFACE, SurfacePayload>;

/** Builds a `Surface` command. */
export function surface(unitId: UnitId): SurfaceCommand {
  return { type: SURFACE, payload: { unitId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [SURFACE]: SurfaceCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [SURFACE]: SurfaceCommand;
  }
}
