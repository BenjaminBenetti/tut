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
  /** Optional flat platform; final placement can decline it to preserve a mission route. */
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

/** An early, bounded platform reservation for one solid colony building. */
export interface CarapaceSite {
  readonly kind: PropKindId;
  readonly footprint: Rect;
  readonly clearance: Rect;
  readonly level: number;
  readonly rotation: Rotation;
}
