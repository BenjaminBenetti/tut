import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";
import type { PropKindId, Rotation } from "./prop";

/** Building-local equipment footprint, installed before stairs choose their landings. */
export interface BuildingEquipment {
  readonly kind: PropKindId;
  readonly x: number;
  readonly z: number;
  readonly rotation?: Rotation;
}

/** An authored building request, realized by the ordinary building/interior passes. */
export interface BuildingSpecification {
  readonly template: string;
  readonly floors: number;
  /** Extra ground-floor doors in addition to the lot's frontage entrance. */
  readonly additionalEntrances?: readonly Direction[];
  readonly roofEquipment?: readonly BuildingEquipment[];
}

// ===========================================
// Lot
// ===========================================

/**
 * A parcel of land the lot pass carved beside a road and the building
 * pass may fill (ADR 0004 §7.3, passes 4–5). Lots never overlap roads,
 * water or each other.
 */
export interface Lot {
  readonly id: string;
  readonly rect: Rect;
  /** Ground level the lot was flattened to. */
  readonly level: number;
  /** Side of the lot that faces the road; entrances go there. */
  readonly frontage: Direction;
  /** Use the exact lot footprint and requested template instead of a random building. */
  readonly building?: BuildingSpecification;
}
