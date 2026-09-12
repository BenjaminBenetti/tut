import type { WallKind } from "../../mapgen/model/wall";

// ===========================================
// Demolition tuning
// ===========================================

/**
 * What it takes to bring a wall down (#1121). Props carry their own
 * force in `PropDefinition.demolition`, because a prop is a kind of
 * thing and the catalogue is where kinds are described; walls are four
 * fixed kinds owned by the map contract, so their forces are tuning.
 *
 * ```
 *   half     1     a parapet, like sandbags
 *   window   2     glass in a masonry frame
 *   door     2     timber in a masonry frame
 *   solid    3     the wall itself
 * ```
 *
 * Whole-building collapse — floors falling in — is not modelled; force 3
 * breaches a building by opening its walls.
 */
export interface DemolitionTuning {
  /** Force needed to destroy each kind of wall. Positive integers. */
  readonly wallForce: Readonly<Record<WallKind, number>>;
}
