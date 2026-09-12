import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { UnitId } from "./unit";

/** Command type for placing a radio squad's scanner. */
export const DEPLOY_RADAR = "tactical:deploy-radar";

/** The acting squad and the clicked deployment tile. */
export interface DeployRadarPayload {
  readonly unitId: UnitId;
  readonly tile: TileCoord;
}

/** Spend an action to place a stationary scanner. */
export type DeployRadarCommand = Command<
  typeof DEPLOY_RADAR,
  DeployRadarPayload
>;

/** Builds the command for the selected squad and clicked tile. */
export function deployRadar(
  unitId: UnitId,
  tile: TileCoord,
): DeployRadarCommand {
  return { type: DEPLOY_RADAR, payload: { unitId, tile } };
}

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [DEPLOY_RADAR]: DeployRadarCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [DEPLOY_RADAR]: DeployRadarCommand;
  }
}
