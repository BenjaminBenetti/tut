import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

// ===========================================
// Tunnel
// ===========================================

/** Command type: a burrowed unit moves under the ground (#1179). */
export const TUNNEL = "tactical:tunnel";

/** Payload of `Tunnel`. */
export interface TunnelPayload {
  readonly unitId: UnitId;
  /**
   * Where it ends up: a column's ground tile, as `tunnel-service` names
   * them. The rules find the route; nobody watches it.
   */
  readonly to: TileCoord;
}

/** Moves a burrowed unit to `to` under the ground, spending action points as a walk would. */
export type TunnelCommand = Command<typeof TUNNEL, TunnelPayload>;

/** Builds a `Tunnel` command. */
export function tunnel(unitId: UnitId, to: TileCoord): TunnelCommand {
  return { type: TUNNEL, payload: { unitId, to } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [TUNNEL]: TunnelCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [TUNNEL]: TunnelCommand;
  }
}
