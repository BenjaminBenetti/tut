import type { PropKindId } from "./prop";

/** Service equipment follows the building's actual use and leaves a clear firing perimeter. */
export interface RooftopFurnishing {
  /** Kinds in the order a service row places them; the first is the row's lead piece. */
  readonly props: readonly PropKindId[];
  readonly tilesPerProp: number;
  readonly maxProps: number;
  readonly spacing: number;
  /**
   * Pieces the roof gets however small it is (#1175), so a landmark's
   * signature piece always stands. Absent, a roof under `tilesPerProp`
   * gets nothing.
   */
  readonly minProps?: number;
}
