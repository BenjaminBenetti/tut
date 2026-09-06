import type { Rotation } from "../../mapgen/model/prop";

/** Corner heights above the tile's low plane, in layers: NW, NE, SE, SW. */
export type TerrainCornerHeights = readonly [number, number, number, number];

/** Fitted terrain surfaces; map heights and traversal remain unchanged. */
export type TerrainSlopeAppearance =
  | { readonly kind: "diagonal"; readonly turns: Rotation }
  | {
      readonly kind: "three-sided" | "three-sided-mouth";
      /** Opening N/E/S/W at turns 0/1/2/3; independent of the old corner convention. */
      readonly turns: Rotation;
    }
  | {
      readonly kind: "transition";
      readonly corners: TerrainCornerHeights;
      /** Shared top edge: 0 is NW-SE, 1 is NE-SW. */
      readonly diagonal: 0 | 1;
    };
