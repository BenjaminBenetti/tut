import type { CityId } from "./city";
import type { RegionId } from "./region";

// ===========================================
// Deployable modifiers
// ===========================================

/**
 * The per-day numbers online deployables contribute to the rest of the
 * tick (GDD §5.6), summed from the effect of each installation's current
 * level by the effects service. Each map omits cities or regions with
 * nothing to add.
 *
 * ```
 *   deployables[] ──► computeModifiers ──┬─► detectionFactor  ──► applyDetection
 *                                        ├─► intelBonus       ──► mission generation
 *                                        ├─► growthFactor     ──► applyGrowth
 *                                        ├─► spreadDeterrence ──► applySpread
 *                                        ├─► garrisonTurrets  ──► tactical mission start
 *                                        └─► incomeBonus      ──► stipend
 * ```
 */
export interface DeployableModifiers {
  /**
   * Fraction in `(0, 1]` the region's detection thresholds are scaled
   * by, keyed by region id. Several installations take the lowest.
   */
  readonly detectionFactor: Readonly<Record<RegionId, number>>;
  /**
   * Whole days longer that missions in the region stay on offer, keyed
   * by region id. Stacks additively.
   */
  readonly intelBonus: Readonly<Record<RegionId, number>>;
  /**
   * Fraction in `[0, 1]` each city's daily growth is multiplied by, keyed
   * by city id. A region's installations apply to every city in the
   * region and stack multiplicatively.
   */
  readonly growthFactor: Readonly<Record<CityId, number>>;
  /**
   * Fraction in `[0, 1]` by which seeding into the region is reduced,
   * keyed by region id. Several installations stack multiplicatively:
   * `1 − Π(1 − d)`, so two halves make three quarters, never more than 1.
   */
  readonly spreadDeterrence: Readonly<Record<RegionId, number>>;
  /**
   * Turrets placed on the map of a mission fought in the region, keyed
   * by region id. Stacks additively.
   */
  readonly garrisonTurrets: Readonly<Record<RegionId, number>>;
  /** Credits added to today's stipend by every online bank on Earth. */
  readonly incomeBonus: number;
}

/** The modifiers of a campaign with nothing online: every map empty, no bonus. */
export const NO_DEPLOYABLE_MODIFIERS: DeployableModifiers = {
  detectionFactor: {},
  intelBonus: {},
  growthFactor: {},
  spreadDeterrence: {},
  garrisonTurrets: {},
  incomeBonus: 0,
};
