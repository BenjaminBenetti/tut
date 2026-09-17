import type { Rotation } from "../../mapgen/model/prop";

/** One ownership slice of a continuous authored resin network. */
export interface ResinPatternAppearance {
  readonly x: number;
  readonly z: number;
  readonly offsetX?: number;
  readonly offsetZ?: number;
  readonly width?: number;
  readonly depth?: number;
  readonly turns: Rotation;
  readonly neighbours: number;
  readonly growth: number;
}
