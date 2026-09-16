import type { KnownPropKindId } from "../../mapgen/data/props";

/** Authored furniture bounds used only to fit presentation against a room wall. */
export interface InteriorFurnitureStyle {
  /** Distance from the wall centre plane; just beyond its half thickness. */
  readonly wallClearance: number;
  /** Distance from the base pivot to the GLB's rear (-Z), measured before rotation. */
  readonly rearExtents: Readonly<Partial<Record<KnownPropKindId, number>>>;
}
