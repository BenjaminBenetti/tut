import type { Direction } from "../../core/model/direction";
import type { Rect } from "../../core/model/grid";

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
}
