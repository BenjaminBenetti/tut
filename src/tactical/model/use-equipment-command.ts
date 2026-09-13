import type { Command } from "../../core/model/command";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { EquipmentId } from "./equipment";
import type { UnitId } from "./unit";

// ===========================================
// UseEquipment
// ===========================================

/** Command type for using one piece of a unit's equipment at a tile (#1132). */
export const USE_EQUIPMENT = "tactical:use-equipment";

/** The acting unit, which of its items, and where. */
export interface UseEquipmentPayload {
  readonly unitId: UnitId;
  readonly equipmentId: EquipmentId;
  /** Where the dish is put, the grenade lands or the charge is placed. */
  readonly tile: TileCoord;
}

/** Spend an action and one use of an item at a tile. */
export type UseEquipmentCommand = Command<
  typeof USE_EQUIPMENT,
  UseEquipmentPayload
>;

/** Builds the command for the selected unit, the chosen item and the clicked tile. */
export function useEquipment(
  unitId: UnitId,
  equipmentId: EquipmentId,
  tile: TileCoord,
): UseEquipmentCommand {
  return { type: USE_EQUIPMENT, payload: { unitId, equipmentId, tile } };
}

// ===========================================
// Registration
// ===========================================

declare module "./tactical-command" {
  interface TacticalCommandMap {
    [USE_EQUIPMENT]: UseEquipmentCommand;
  }
}

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [USE_EQUIPMENT]: UseEquipmentCommand;
  }
}
