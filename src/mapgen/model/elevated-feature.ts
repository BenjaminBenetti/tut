import type { SettlementScale } from "../../content/model/settlement-scale";
import type { IntRange } from "./settlement-definition";
import type { SurfaceId } from "./surface";

// ===========================================
// Elevated features
// ===========================================

/**
 * How a feature's footprint is cut out of the free ground.
 *
 * ```
 *   plaza  ▓▓▓▓▓   strip  ▓▓▓▓▓▓▓▓▓   mound   ▓▓▓    viaduct ═══════
 *          ▓▓▓▓▓          ▓▓▓▓▓▓▓▓▓          ▓▓▓▓▓            ═══════
 *          ▓▓▓▓▓                              ▓▓▓
 * ```
 *
 * `plaza` keeps the whole rectangle, `strip` is a long thin run laid
 * along whichever axis fits, and `mound` trims its corners so the shape
 * reads as spoil rather than construction. `viaduct` is the odd one: it
 * lifts a run of the street grid itself, sidewalks included, which is
 * where most of a city's walkable ground is.
 */
export type ElevatedShape = "plaza" | "strip" | "mound" | "viaduct";

/**
 * A raised outdoor structure the elevation pass stamps onto a settlement
 * plat (#512). Every feature is exactly one level above the ground it
 * sits on, so the ramp pass connects it and both unit classes can walk
 * up: this is the height a mech can hold on a city map, where the plats
 * are graded flat and roofs are infantry-only.
 *
 * Adding a feature is a data change — a new entry in
 * `mapgen/data/elevated-features` — never a pass edit (ADR 0004 §7.4).
 */
export interface ElevatedFeature {
  readonly id: string;
  readonly shape: ElevatedShape;
  /** Surface the raised columns take; decides how the feature reads. */
  readonly surface: SurfaceId;
  /** Extent along the feature's long axis, in columns. */
  readonly length: IntRange;
  /** Extent across it, in columns. */
  readonly breadth: IntRange;
  /** Relative chance of being drawn against the other eligible features. */
  readonly weight: number;
  /** Settlement scales the feature belongs in. */
  readonly scales: readonly SettlementScale[];
}
