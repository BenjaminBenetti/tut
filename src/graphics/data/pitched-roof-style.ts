import type { PitchedRoofStyle } from "../model/pitched-roof-appearance";

/** Shallow domestic roof, in world units; independent of terrain elevation layers. */
export const PITCHED_ROOF_STYLE: PitchedRoofStyle = {
  eaveThickness: 0.12,
  risePerTile: 0.25,
} as const;
