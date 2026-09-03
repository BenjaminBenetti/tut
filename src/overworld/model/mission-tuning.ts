import type { MissionTypeId } from "../../content/model/mission-type-id";

// ===========================================
// Per-type rule
// ===========================================

/**
 * How one mission type is offered (GDD §5.4). Kept as data keyed by
 * `MissionTypeId` so an M3 type registers by adding a rule, never by
 * editing the generation service.
 *
 * ```
 *   chance(infestation)
 *   chanceAtMax        ┤                        ●
 *                      │                   ╱
 *   chanceAtThreshold  ┤            ●─────╱
 *                    0 ┼────────────┘
 *                      └────────────┴────────────┴──► city infestation
 *                      0     minInfestation    100
 *
 *   difficulty = band.min + (band.max − band.min)
 *                × (infestationWeight × infestation/100 + threatWeight × threat/100)
 * ```
 */
export interface MissionTypeGenerationRule {
  /** City infestation below which this type is never offered. `0..100`. */
  readonly minInfestation: number;
  /** Daily offer chance at exactly `minInfestation`. `0..1`. */
  readonly chanceAtThreshold: number;
  /** Daily offer chance at maximum infestation. `0..1`, at least `chanceAtThreshold`. */
  readonly chanceAtMax: number;
  /** Share of difficulty pressure that comes from the host city's infestation. */
  readonly infestationWeight: number;
  /** Share of difficulty pressure that comes from global threat. Weights sum to `1`. */
  readonly threatWeight: number;
  /** Difficulty from which the map is generated at `"medium"` size instead of `"small"`. */
  readonly mediumFromDifficulty: number;
  /** Difficulty from which the map is generated at `"large"` size. At least `mediumFromDifficulty`. */
  readonly largeFromDifficulty: number;
}

// ===========================================
// Tuning
// ===========================================

/**
 * Balance knobs for mission generation. The tick receives a tuning
 * object rather than importing the defaults, so tests and future
 * difficulty settings can substitute their own. Defaults live in
 * `overworld/data/mission-tuning.ts`.
 */
export interface MissionTuning {
  /** One rule per shipped mission type; a type without a rule fails to compile. */
  readonly rules: Readonly<Record<MissionTypeId, MissionTypeGenerationRule>>;
}
