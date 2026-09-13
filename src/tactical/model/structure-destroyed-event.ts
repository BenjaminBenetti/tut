import type { DomainEvent } from "../../core/model/domain-event";
import type { Direction } from "../../core/model/direction";
import type { PropKindId } from "../../mapgen/model/prop";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WallKind } from "../../mapgen/model/wall";
import type { UnitId } from "./unit";

// ===========================================
// StructureDestroyed
// ===========================================

/** Event type: a blast brought a prop or a wall down. */
export const STRUCTURE_DESTROYED = "tactical:structure-destroyed";

/** What fell: a whole prop, or one wall on one edge of one tile. */
export type DestroyedStructure =
  | {
      readonly kind: "prop";
      readonly propId: string;
      readonly propKind: PropKindId;
    }
  | {
      readonly kind: "wall";
      readonly side: Direction;
      readonly wallKind: WallKind;
    };

/** Payload of `StructureDestroyed`. */
export interface StructureDestroyedPayload {
  /** The unit whose shot did it. */
  readonly unitId: UnitId;
  /** The tile the structure stood on: a prop's anchor, or the tile whose edge the wall was. */
  readonly tile: TileCoord;
  readonly structure: DestroyedStructure;
}

/** A structure was demolished (#1121). One event per prop and per wall edge. */
export type StructureDestroyedEvent = DomainEvent<
  typeof STRUCTURE_DESTROYED,
  StructureDestroyedPayload
>;

// ===========================================
// Registration
// ===========================================

declare module "./tactical-event" {
  interface TacticalEventMap {
    [STRUCTURE_DESTROYED]: StructureDestroyedEvent;
  }
}
