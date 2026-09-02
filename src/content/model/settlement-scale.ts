// ===========================================
// Settlement scale
// ===========================================

/**
 * How built-up a mission site is (GDD §7). Shared by overworld cities and
 * map generation; the generation definitions are keyed by these ids in
 * `mapgen/data/settlements`.
 */
export type SettlementScale = "rural" | "town" | "city";

/** Every settlement scale, sparsest first. */
export const SETTLEMENT_SCALES: readonly SettlementScale[] = [
  "rural",
  "town",
  "city",
];
