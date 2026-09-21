import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WallKind } from "../../mapgen/model/wall";

/** One known wall run on tile boundaries, in the containing elevation layer. */
export interface JevWallRun {
  readonly kind: WallKind;
  readonly from: { readonly x: number; readonly z: number };
  readonly to: { readonly x: number; readonly z: number };
  readonly knowledge: "visible" | "remembered";
}

/** Sparse ASCII edge maps: row is z, character index is x; blanks mean no known wall. */
export interface JevMapWalls {
  readonly vertical?: Readonly<Record<string, string>>;
  readonly horizontal?: Readonly<Record<string, string>>;
}

/** Exceptional tile properties grouped by value, with `x,z` coordinates on the layer. */
export interface JevMapFeatures {
  readonly cover_provided?: Readonly<
    Partial<Record<0 | 1 | 2, readonly string[]>>
  >;
  readonly blocks_sight?: Readonly<
    Partial<Record<"true" | "false", readonly string[]>>
  >;
}

/** A public or perceived point of interest; terrain under its glyph remains explicit. */
export interface JevMapMarker {
  readonly symbol: string;
  readonly id: string;
  readonly position: TileCoord;
  readonly footprint?: number;
  readonly terrain?: string;
}

/** Full map bounds at one elevation; trimmed row spans overlay the default fog fill. */
export interface JevMapLayer {
  readonly y: number;
  readonly rows?: Readonly<Record<string, string>>;
  readonly row_start_x?: Readonly<Record<string, number>>;
  readonly fill: "f";
  readonly markers: readonly JevMapMarker[];
  readonly walls: JevMapWalls;
  readonly features: JevMapFeatures;
}
