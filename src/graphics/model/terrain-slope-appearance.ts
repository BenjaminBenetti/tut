import type { Rotation } from "../../mapgen/model/prop";

/** Corner heights above the tile's low plane, in layers: NW, NE, SE, SW. */
export type TerrainCornerHeights = readonly [number, number, number, number];

/** A diagonal chain surface or the adjacent cap that meets its shared vertices. */
export type TerrainSlopeAppearance =
  | { readonly kind: "diagonal"; readonly turns: Rotation }
  | { readonly kind: "transition"; readonly corners: TerrainCornerHeights };
