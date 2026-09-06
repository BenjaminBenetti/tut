import type { Rotation } from "../../mapgen/model/prop";
import type { RoadStyle } from "../../mapgen/model/settlement-definition";

/** One road tile's material and modular details, independent of its world position. */
export interface RoadAppearance {
  readonly style: RoadStyle;
  /** Turns of the kerb authored on +Z: 0 south, 1 west, 2 north, 3 east. */
  readonly kerbs: readonly Rotation[];
  /** One divider across the whole carriageway, centred for odd lane counts. */
  readonly line?: { readonly turns: Rotation; readonly offset: number };
  /** One existing junction mark at the centre of the crossing, including even widths. */
  readonly junction?: {
    readonly kind: "t" | "cross";
    readonly turns: Rotation;
    readonly x: number;
    readonly z: number;
  };
}
