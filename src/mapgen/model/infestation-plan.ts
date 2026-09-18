import type { Direction } from "../../core/model/direction";
import type { TileCoord } from "./tile-coord";
import type { Rect } from "../../core/model/grid";
import type { PropKindId, Rotation } from "./prop";
import type { ColumnCoord } from "./road";

/** A colony district reserved before parcels and buildings are generated. */
export interface InfestationZone {
  readonly id: string;
  readonly centre: ColumnCoord;
  /** Outer reach of the growth field, in tiles. */
  readonly radius: number;
  /** Nest clearing, unavailable to buildings and conventional landscaping. */
  readonly clearingRadius: number;
  readonly maturity: "outbreak" | "nest" | "hive";
  /** An open colony formation planned before settlement parcels claim its courtyard. */
  readonly carapace?: CarapaceSite;
}

/** A branching feeding route between colonies; it can invade existing streets. */
export interface InfestationCorridor {
  readonly from: string;
  readonly to: string;
  readonly points: readonly ColumnCoord[];
}

/** A contiguous structural failure aimed towards the nearest colony. */
export interface InfestationRuin {
  readonly buildingId: string;
  readonly breach: ColumnCoord;
  readonly radius: number;
}

/** Serializable generation provenance shared by simulation and presentation. */
export interface InfestationPlan {
  readonly level: number;
  readonly zones: readonly InfestationZone[];
  readonly corridors: readonly InfestationCorridor[];
  /** Row-major 0..1 growth pressure, quantized to hundredths, indexed z * width + x. */
  readonly influence: readonly number[];
  readonly ruins: readonly InfestationRuin[];
}

/** A wall module with semantic connections, independent of graphics model ids. */
export interface CarapaceWallCell {
  readonly tile: TileCoord;
  readonly kind: PropKindId;
  readonly rotation: Rotation;
  readonly joins: readonly Direction[];
}

/** Two adjacent free boundary cells, facing out of the colony courtyard. */
export interface CarapaceGateway {
  readonly tiles: readonly ColumnCoord[];
  readonly outward: Direction;
  /** A two-cell-wide channel extending two cells outside and inside the boundary. */
  readonly approach: readonly ColumnCoord[];
}

/** A terrain-following formation of joined walls around an accessible open courtyard. */
export interface CarapaceSite {
  readonly footprint: Rect;
  readonly clearance: Rect;
  readonly cells: readonly CarapaceWallCell[];
  readonly courtyard: readonly ColumnCoord[];
  readonly gateways: readonly CarapaceGateway[];
  /** The bounded, level route supporting native 2×2 units between the two gateways. */
  readonly passage: readonly TileCoord[];
  /** False during early planning; true only after individual module props are installed. */
  readonly realized: boolean;
}

/** A local cell graph before terrain, parcels and mission reservations are applied. */
export interface CarapaceOutline {
  readonly width: number;
  readonly depth: number;
  readonly walls: readonly ColumnCoord[];
  readonly courtyard: readonly ColumnCoord[];
  readonly gateways: readonly CarapaceGateway[];
}
