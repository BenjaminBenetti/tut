import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// Move
// ===========================================

/** Command type: a unit walks a path (GDD §6.2). */
export const MOVE = "tactical:move";

/** Payload of `Move`. */
export interface MovePayload {
  readonly unitId: UnitId;
  /** Tiles stepped through, in order, ending on the destination; each adjacent to the last. */
  readonly path: readonly TileCoord[];
}

/** Moves a unit along `path`, spending action points per the movement rules (#325). */
export type MoveCommand = Command<typeof MOVE, MovePayload>;

/** Builds a `Move` command. */
export function move(unitId: UnitId, path: readonly TileCoord[]): MoveCommand {
  return { type: MOVE, payload: { unitId, path } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [MOVE]: MoveCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [MOVE]: MoveCommand;
  }
}
