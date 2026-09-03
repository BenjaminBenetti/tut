import type { CityId } from "./city";
import type { RegionId } from "./region";

// ===========================================
// Deployable modifiers
// ===========================================

/**
 * The per-day numbers online deployables contribute to the rest of the
 * tick (GDD §5.6), summed from `DeployableType.effect` by the effects
 * service. Each map omits cities or regions with nothing to add.
 *
 * ```
 *   deployables[] ──► computeModifiers ──┬─► suppression      ──► applyGrowth
 *                                        ├─► spreadDeterrence ──► applySpread
 *                                        └─► intelBonus       ──► mission generation
 * ```
 */
export interface DeployableModifiers {
  /**
   * Infestation points removed from each city's growth per day, keyed by
   * city id. A region's batteries apply to every city in the region and
   * stack additively.
   */
  readonly suppression: Readonly<Record<CityId, number>>;
  /**
   * Fraction in `[0, 1]` by which seeding into the region is reduced,
   * keyed by region id. Several installations stack multiplicatively:
   * `1 − Π(1 − d)`, so two halves make three quarters, never more than 1.
   */
  readonly spreadDeterrence: Readonly<Record<RegionId, number>>;
  /**
   * Whole days earlier that missions in the region are revealed, keyed by
   * region id. Stacks additively.
   */
  readonly intelBonus: Readonly<Record<RegionId, number>>;
}
