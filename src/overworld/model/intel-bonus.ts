import type { RegionId } from "./region";

// ===========================================
// Intel bonus
// ===========================================

/**
 * Extra days of mission availability per region, keyed by region id.
 * Produced by the deployable effects tick (#66) from sensor coverage; a
 * region with no entry gets no bonus. Values are non-negative integers.
 */
export type IntelBonus = Readonly<Record<RegionId, number>>;
