import type { ActId } from "../../content/model/act-id";
import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { GreatHiveTuning } from "./great-hive-tuning";

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
  /** Where a crash site lands, how big the landing is and what it pays (arc §6.3). */
  readonly crashSite: CrashSiteTuning;
  /** How long a lost mech's wreck waits for its recovery offer (arc §6.6). */
  readonly wreck: WreckRecoveryTuning;
  /** Where an evacuation is offered, how many groups it holds and what it pays (arc §6.4). */
  readonly evacuation: EvacuationTuning;
  /** What a Hive Assault pays on top of its difficulty (campaign arc §6.5). */
  readonly hiveAssault: HiveAssaultTuning;
  /** How the three Great Hives are revealed, offered and scaled (arc §6.9). */
  readonly greatHive: GreatHiveTuning;
  /** When a city about to spread is offered a tunnel sabotage, and what a win holds (arc §6.7). */
  readonly tunnelSabotage: TunnelSabotageTuning;
}

// ===========================================
// Tunnel sabotage
// ===========================================

/**
 * The Tunnel Sabotage's two campaign rules (arc §6.7). The threshold is
 * not here: a city is eligible at the infestation tuning's
 * `spreadThreshold`, the level at which it spreads at all.
 *
 * ```
 *   eligible  detected city, no offer, at spreadThreshold,
 *             next spread due within spreadWindowDays days
 *   won       the city's spread cooldown ──► holdDays
 * ```
 */
export interface TunnelSabotageTuning {
  /**
   * How many days ahead of a city's next spread the offer may open, at
   * least 1. The offer lasts until the spread is due, so this is also
   * the longest it stays on the board.
   */
  readonly spreadWindowDays: number;
  /** Spread cooldown a win leaves on the city, in days; at least 1. */
  readonly holdDays: number;
}

// ===========================================
// Wreck recovery
// ===========================================

/**
 * How long a wreck waits to be offered (arc §6.6). The offer is made on
 * the first tick after the loss whose city is free; a wreck whose city
 * stays taken for `offerWindowDays` days is gone, and the launch handler
 * drops its record.
 *
 * ```
 *   lost on day L ──► offered on the first free day d with d < L + offerWindowDays
 * ```
 */
export interface WreckRecoveryTuning {
  /** Days after the loss during which the wreck may still be offered; at least 1. */
  readonly offerWindowDays: number;
  /**
   * Player turns a squad works the wreck before its parts come loose,
   * one interaction per turn; written on the record at the loss so the
   * tactical setup copies it onto the strip-wreck objective. At least 1.
   */
  readonly stripTurns: number;
}

// ===========================================
// Hive assault
// ===========================================

/**
 * The Hive Assault's reward knob (campaign arc §6.5: "TP reward is
 * large"). The offer's tech points are the type's ordinary award at its
 * difficulty, multiplied and rounded down:
 *
 * ```
 *   techPoints = floor((techRewardBase + techRewardPerDifficulty × d) × techRewardMultiplier)
 * ```
 *
 * Credits are not multiplied: the hive's pay-off is the liberated
 * region and the research it feeds, not cash.
 */
export interface HiveAssaultTuning {
  /** Multiplier on the offer's ordinary tech-point award. At least `1`. */
  readonly techRewardMultiplier: number;
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
// Crash site
// ===========================================

/**
 * The crash site's overworld rules (campaign arc §5, §6.3):
 *
 * ```
 *   eligible   a region with a detected city; every free city in it may be
 *              the landing, weighted
 *                city < lowInfestationBelow          ──► × lowCityWeight
 *                act ≥ sensorArrayFromAct, region holds an
 *                online sensorArrayType installation ──► × sensorArrayWeight
 *   offered    landing city + landingInfestation, and the city is seen
 *   rewards    techPoints = round(ordinary × techPointMultiplier)
 * ```
 *
 * What a lapsed or lost landing costs is the type's `ignorePenalty` in
 * content, frozen on the offer, so the briefing and the rule read one
 * number.
 */
export interface CrashSiteTuning {
  /** Infestation the landing seeds at its city when the offer is made (arc: 10). */
  readonly landingInfestation: number;
  /** A city under this infestation is a clean or low landing site. `0..100`. */
  readonly lowInfestationBelow: number;
  /** How many times as often a clean or low city is drawn as the landing. At least `1`. */
  readonly lowCityWeight: number;
  /** The first act in which sensor arrays pull landings towards their region. */
  readonly sensorArrayFromAct: ActId;
  /** The installation that counts as a sensor array when it is online in the region. */
  readonly sensorArrayType: DeployableTypeId;
  /** Site weight multiplier for a region holding an online sensor array (arc: ×2). */
  readonly sensorArrayWeight: number;
  /** Tech points a crash site pays, as a multiple of the type's ordinary reward (arc: ×1.5). */
  readonly techPointMultiplier: number;
}

// ===========================================
// Evacuation
// ===========================================

/**
 * A timed scale on the daily stipend a mission's outcome grants: the
 * factor applies to the next `days` payments.
 */
export interface StipendWindow {
  /** Multiplier on each payment in the window. Positive. */
  readonly factor: number;
  /** Payments the window covers. Positive integer. */
  readonly days: number;
}

/**
 * The evacuation's overworld rules (campaign arc §6.4):
 *
 * ```
 *   eligible   detected city, no offer, infestation ≥ minInfestation
 *   weight     1 + log10(max(1, population / populationWeightUnit))
 *              (under 100k ─► 1, 1M ─► 2, 10M ─► 3; bigger cities are
 *              drawn more often, but a megacity never drowns the rest)
 *   groups     clamp(minGroups + ⌊(difficulty − 1) / difficultyPerGroup⌋,
 *                    minGroups, maxGroups)
 *   saved      credits + creditsPerGroup × groups aboard, and savedStipend
 *   lost       credits paid as any mission's, + creditsPerGroup × groups aboard,
 *              and lostStipend; an evacuation left to lapse gets lostStipend too
 * ```
 */
export interface EvacuationTuning {
  /** Least city infestation at which a detected city may be offered one. `0..100`. */
  readonly minInfestation: number;
  /** Population one step of the site weight stands for; `100_000` makes a town weigh 1. */
  readonly populationWeightUnit: number;
  /** Groups trapped at difficulty 1; the fewest an evacuation holds. */
  readonly minGroups: number;
  /** Most groups an evacuation holds. At least `minGroups`. */
  readonly maxGroups: number;
  /** Difficulty steps per extra group. Positive. */
  readonly difficultyPerGroup: number;
  /** Credits each group walked aboard adds to the payout. */
  readonly creditsPerGroup: number;
  /** The stipend window a saved evacuation grants (arc: +50% for 10 days). */
  readonly savedStipend: StipendWindow;
  /** The stipend window a lost or ignored evacuation costs (arc: −10% for 10 days). */
  readonly lostStipend: StipendWindow;
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
