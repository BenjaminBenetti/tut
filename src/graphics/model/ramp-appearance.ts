import type { SurfaceId } from "../../mapgen/model/surface";
import type { TileCoord } from "../../mapgen/model/tile-coord";

/** Ramp support/material, separate from the upper tile that owns its vision. */
export interface RampAppearance {
  readonly id: string;
  readonly from: TileCoord;
  readonly surface: SurfaceId;
  /** Shared feet keep their flat centre under the shortened ramp approaches. */
  readonly replacesGround: boolean;
}
