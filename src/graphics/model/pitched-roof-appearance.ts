/** Roof profile across one tile, measured above the top-storey wall line. */
export interface PitchedRoofAppearance {
  /** Heights at local X -0.5, 0 and +0.5; the middle point closes odd-width ridges. */
  readonly heights: readonly [number, number, number];
  /** A hipped roof also falls towards both Z ends; each point takes the lower profile. */
  readonly depthHeights?: readonly [number, number, number];
}

/** Domestic roof proportions in world units, separate from walkable elevation layers. */
export interface PitchedRoofStyle {
  readonly eaveThickness: number;
  readonly risePerTile: number;
}
