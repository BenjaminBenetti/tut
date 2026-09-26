import type { ActId } from "../../content/model/act-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";

// ===========================================
// Per-type difficulty
// ===========================================

/**
 * How one mission type's difficulty and map size follow from where it
 * is offered (GDD §5.4). Kept as data keyed by `MissionTypeId`, so a new
 * type registers its weights here and its offer rule reads them. Which
 * city is offered a mission, and when, is the type's offer rule's
 * business (ADR 0013 §2.3), not this table's.
 *
 * ```
 *   pressure   = infestationWeight × infestation/100 + threatWeight × threat/100
 *   difficulty = band.min + (band.max − band.min) × pressure, rounded,
 *                then clamped into the act's band (arc §3)
 *
 *   size       small ──► medium at mediumFromDifficulty ──► large at largeFromDifficulty
 * ```
 */
export interface MissionDifficultyRule {
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
// Offer chance
// ===========================================

/**
 * A daily chance that climbs with infestation, for a trigger rule that
 * rolls (#1175):
 *
 * ```
 *   chance(infestation)
 *   chanceAtMax        ┤                        ●
 *                      │                   ╱
 *   chanceAtThreshold  ┤            ●─────╱
 *                    0 ┼────────────┘
 *                      └────────────┴────────────┴──► infestation
 *                      0     minInfestation    100
 * ```
 */
export interface OfferChanceCurve {
  /** Infestation below which the roll is never made. `0..100`. */
  readonly minInfestation: number;
  /** Daily chance at exactly `minInfestation`. `0..1`. */
  readonly chanceAtThreshold: number;
  /** Daily chance at maximum infestation. `0..1`, at least `chanceAtThreshold`. */
  readonly chanceAtMax: number;
}

// ===========================================
// Tuning
// ===========================================

/**
 * Balance knobs for mission offers. The tick receives a tuning object
 * rather than importing the defaults, so tests and future difficulty
 * settings can substitute their own. Defaults live in
 * `overworld/data/mission-tuning.ts`.
 */
export interface MissionTuning {
  /** One difficulty rule per shipped mission type; a type without one fails to compile. */
  readonly difficulty: Readonly<Record<MissionTypeId, MissionDifficultyRule>>;
  /** How often an offer carries a tech carcass and what it is worth (#1171). */
  readonly techCarcass: TechCarcassTuning;
  /** Where an infestation clearance may be offered, and its mop-up (arc §5, §6.1). */
  readonly clearance: ClearanceTuning;
  /** When a defend-installation mission is triggered and how many waves it sends (#1175). */
  readonly defence: InstallationDefenceTuning;
}

// ===========================================
// Infestation clearance
// ===========================================

/**
 * The clearance's two campaign rules (arc §5, §6.1):
 *
 * ```
 *   eligible   detected city, no offer, infestation ≥ minInfestationByAct[act]
 *   mop-up     won, and the city is left under mopUpBelow ──► purged to 0
 * ```
 */
export interface ClearanceTuning {
  /**
   * Least city infestation at which a detected city may be offered a
   * clearance, per act. Act I reaches lower, so the first offers come
   * while the landings are still small.
   */
  readonly minInfestationByAct: Readonly<Record<ActId, number>>;
  /**
   * A won clearance that leaves its city below this purges it to 0.
   * `0` would turn the mop-up off.
   */
  readonly mopUpBelow: number;
}

// ===========================================
// Installation defence
// ===========================================

/**
 * How a defend-installation mission is triggered and sized (#1175). The
 * trigger rolls `offer` against a region's mean infestation, once a day
 * per region holding an installation. The wave count frozen into the
 * offer is a linear function of the same infestation, capped:
 *
 * ```
 *   waves = min(maxWaves, baseWaves + floor(wavesPerInfestationPoint × regionInfestation))
 *
 *   maxWaves  ┤                    ●━━━━━━━━
 *             │               ╱
 *   baseWaves ┤━━━━━━━━●━━━━╱
 *             └────────┴────────┴────────► region mean infestation
 *             0    minInfestation        100
 * ```
 */
export interface InstallationDefenceTuning {
  /** The daily trigger roll, read against the region's mean infestation. */
  readonly offer: OfferChanceCurve;
  /** Waves at zero regional infestation; the least a defend mission ever sends. */
  readonly baseWaves: number;
  /** Extra waves per point of regional infestation, floored. */
  readonly wavesPerInfestationPoint: number;
  /** Most waves a defend mission sends. At least `baseWaves`. */
  readonly maxWaves: number;
}

// ===========================================
// Tech carcass
// ===========================================

/**
 * The tech carcass roll (#1171), made once per offer:
 *
 * ```
 *   rng.fork(`carcass:${missionId}`).chance(chance)
 *     ──► techPoints = basePoints + pointsPerDifficulty × difficulty
 * ```
 */
export interface TechCarcassTuning {
  /** Probability an offer carries a carcass. `0..1`. */
  readonly chance: number;
  /** Tech points a carcass is worth at difficulty 0. */
  readonly basePoints: number;
  /** Tech points added per point of mission difficulty. */
  readonly pointsPerDifficulty: number;
}
