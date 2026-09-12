import type { TileEffectKind } from "./tile-effect";

// ===========================================
// Hazard tuning
// ===========================================

/** How one kind of tile effect behaves while it lasts (#1121). */
export interface TileEffectRule {
  /** Hit points a unit standing in it loses each time it acts, before armor. Positive. */
  readonly damage: number;
  /** Armor points the effect ignores. Non-negative. */
  readonly armorPen: number;
  /** Phases it lasts from the moment it is lit. Positive integer. */
  readonly duration: number;
}

/**
 * Balance knobs for tile effects (#1121). Services receive a tuning
 * object rather than importing the defaults, so tests and future
 * difficulty settings can substitute their own. Defaults live in
 * `tactical/data/hazard-tuning.ts`.
 *
 * ```
 *   fire   damage 4 · armorPen 2 · duration 4 phases (two full rounds)
 * ```
 */
export interface HazardTuning {
  readonly effects: Readonly<Record<TileEffectKind, TileEffectRule>>;
}
