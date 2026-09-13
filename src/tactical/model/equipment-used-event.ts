import type { DomainEvent } from "../../core/model/domain-event";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { EquipmentId } from "./equipment";
import type { UnitId } from "./unit";

// ===========================================
// EquipmentUsed
// ===========================================

/** Event type: a unit spent one use of an item (#1132). */
export const EQUIPMENT_USED = "tactical:equipment-used";

/** Payload of `EquipmentUsed`: who, what, where, and what is left. */
export interface EquipmentUsedPayload {
  readonly unitId: UnitId;
  readonly equipmentId: EquipmentId;
  /** The item's display name, so the log needs no catalogue. */
  readonly name: string;
  readonly tile: TileCoord;
  /** Uses the unit has left of it after this one. */
  readonly usesLeft: number;
}

/** A unit used a piece of equipment; what it did follows in its own events. */
export type EquipmentUsedEvent = DomainEvent<
  typeof EQUIPMENT_USED,
  EquipmentUsedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [EQUIPMENT_USED]: EquipmentUsedEvent;
  }
}
