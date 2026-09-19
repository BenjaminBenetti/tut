import type { Command } from "../../core/model/command";
import type { TechCarcassId } from "./tech-carcass";
import type { UnitId } from "./unit";

// ===========================================
// HarvestCarcass
// ===========================================

/** Command type: a squad strips a tech carcass in reach (#1171, GDD §6.3). */
export const HARVEST_CARCASS = "tactical:harvest-carcass";

/** Payload of `HarvestCarcass`. */
export interface HarvestCarcassPayload {
  readonly unitId: UnitId;
  /** The carcass the squad strips; must be in reach per the harvest rules. */
  readonly carcassId: TechCarcassId;
}

/** Spends the interact action on a tech carcass, banking its tech points for the debrief. */
export type HarvestCarcassCommand = Command<
  typeof HARVEST_CARCASS,
  HarvestCarcassPayload
>;

/** Builds a `HarvestCarcass` command. */
export function harvestCarcass(
  unitId: UnitId,
  carcassId: TechCarcassId,
): HarvestCarcassCommand {
  return { type: HARVEST_CARCASS, payload: { unitId, carcassId } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [HARVEST_CARCASS]: HarvestCarcassCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [HARVEST_CARCASS]: HarvestCarcassCommand;
  }
}
