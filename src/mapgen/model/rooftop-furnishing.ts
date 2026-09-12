import type { PropKindId } from "./prop";

/** Service equipment follows the building's actual use and leaves a clear firing perimeter. */
export interface RooftopFurnishing {
  readonly props: readonly PropKindId[];
  readonly tilesPerProp: number;
  readonly maxProps: number;
  readonly spacing: number;
}
