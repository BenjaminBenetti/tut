import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { DeployableTypeId } from "../../content/model/deployable-type-id";
import type { MechId } from "../../roster/model/mech";
import type { SquadId } from "../../roster/model/squad";
import type { CityId } from "./city";
import type { MissionId } from "./mission";

// ===========================================
// Outcome
// ===========================================

/**
 * How a mission ended.
 *
 * | Outcome     | Meaning                                                  |
 * |-------------|----------------------------------------------------------|
 * | `won`       | objectives complete; full rewards                        |
 * | `lost`      | force wiped or mission failed; nothing extracted         |
 * | `extracted` | force pulled out before finishing; survivors come home   |
 */
export type MissionOutcome = "won" | "lost" | "extracted";

/**
 * Runtime list of every `MissionOutcome`, for validation and for tests
 * that must cover each outcome. Kept in sync with the union by `satisfies`.
 */
export const MISSION_OUTCOMES = [
  "won",
  "lost",
  "extracted",
] as const satisfies readonly MissionOutcome[];

/** Narrows an arbitrary string (from a save file, for instance) to a `MissionOutcome`. */
export function isMissionOutcome(value: string): value is MissionOutcome {
  return (MISSION_OUTCOMES as readonly string[]).includes(value);
}

// ===========================================
// Per-unit reports
// ===========================================

/** Soldiers one deployed squad lost. */
export interface SquadCasualties {
  readonly squadId: SquadId;
  /** Soldiers lost, `0` to the squad's strength at launch. */
  readonly losses: number;
  /** Kills credited to the squad (#64); absent means none. */
  readonly kills?: number;
  /** Experience those kills were worth (#1130); absent means none. */
  readonly xp?: number;
}

/** Damage one deployed mech took. */
export interface MechDamageReport {
  readonly mechId: MechId;
  /** Damage added, `>= 0`, on the mech's `0..MECH_MAX_DAMAGE` scale. */
  readonly damage: number;
  /** Kills credited to the mech (#64); absent means none. */
  readonly kills?: number;
  /** Experience those kills were worth (#1130); absent means none. */
  readonly xp?: number;
}

// ===========================================
// Mission result
// ===========================================

/**
 * What flows back to the overworld when a mission ends (GDD §6.5):
 * casualties, destroyed mechs, rewards, the host city's infestation
 * change and any intel. Produced by a `MissionResolver`; applied to the
 * roster, economy and map by `LaunchMission` (#67). Plain data.
 *
 * ```
 *   resolver ──► MissionResult ──► applier
 *                 ├─ squadCasualties / squadsWiped ──► roster (#64)
 *                 ├─ mechDamage / mechsDestroyed ────► roster (#64)
 *                 ├─ creditsAwarded ─────────────────► economy (#53)
 *                 ├─ techPointsAwarded ──────────────► economy (#1171)
 *                 ├─ infestationDelta ───────────────► host city
 *                 ├─ outcome, speciesKilled? ────────► campaign progress
 *                 ├─ intel? ─────────────────────────► reserved (#52 sensor array)
 *                 └─ objectives? ────────────────────► consequence rules (ADR 0013)
 * ```
 *
 * Invariants a resolver upholds (not enforced by the type): every id in
 * `squadsWiped` also appears in `squadCasualties`, and every id in
 * `mechsDestroyed` also appears in `mechDamage`, so the applier can
 * treat the wiped and destroyed lists as summaries of the reports.
 */
export interface MissionResult {
  /** The mission that was resolved. */
  readonly missionId: MissionId;
  /**
   * The city the mission was fought over, so the debrief can name what
   * the player chose rather than an internal id (#739).
   *
   * The id rather than the name: cities outlive missions in
   * `overworld.cities`, so the view resolves the current name from one
   * place instead of this carrying a copy that could go stale. It has to
   * be here at all because `launch-mission-service` removes the mission
   * from the offers in the same update that sets `lastMissionResult` —
   * by the time the debrief renders, `missionId` points at nothing.
   */
  readonly cityId: CityId;
  /** How it ended. */
  readonly outcome: MissionOutcome;
  /** Losses per deployed squad; squads with no losses may be omitted. */
  readonly squadCasualties: readonly SquadCasualties[];
  /** Squads whose strength reached zero; removed from the roster. */
  readonly squadsWiped: readonly SquadId[];
  /** Mechs whose damage reached `MECH_MAX_DAMAGE`; gone with their parts. */
  readonly mechsDestroyed: readonly MechId[];
  /** Damage per deployed mech; mechs with no damage may be omitted. */
  readonly mechDamage: readonly MechDamageReport[];
  /** Whole credits paid out, `>= 0`; usually `rewards.credits` on a win and `0` on a loss. */
  readonly creditsAwarded: number;
  /**
   * Whole tech points paid out, `>= 0` (#1171): the outcome's share of
   * `rewards.techPoints` plus whatever was harvested on the map.
   */
  readonly techPointsAwarded: number;
  /**
   * The part of `techPointsAwarded` that came from harvesting a tech
   * carcass (#1171), so the debrief can say so. Absent when nothing was.
   */
  readonly techPointsHarvested?: number;
  /**
   * Signed integer added to the host city's infestation; negative on a
   * successful clearance. The applier clamps to the city's bounds.
   */
  readonly infestationDelta: number;
  /**
   * Intel points unlocked by the mission (GDD §6.5). Reserved for the
   * sensor array deployable's `intelBonus` (#52); never set in M1.
   */
  readonly intel?: number;
  /**
   * Roster ids of the squads and mechs the player left on the map when
   * leaving the mission (#1132), in the order they were stranded. Each
   * is also in `squadsWiped` or `mechsDestroyed`; this says why, so the
   * debrief can name them as left behind rather than as casualties.
   * Absent when nobody was.
   */
  readonly leftBehind?: readonly string[];
  /** For a defence (#1175): which installation, and whether a generator still ran at the end. */
  readonly defence?: MissionResultDefence;
  /**
   * For a crash site (campaign arc §6.3): true when the squad wrecked the
   * spore pod before it matured, false when it matured or was left
   * standing. Absent when the mission had no pod, or nobody played it.
   */
  readonly podDestroyed?: boolean;
  /**
   * Every bug species killed in the mission, each once, in the order
   * their first death was logged (ADR 0013 §2.1). The launch handler
   * merges them into the campaign's first-kill record. Absent when the
   * resolver cannot say, as the auto-resolver does not, or when no bug
   * died.
   */
  readonly speciesKilled?: readonly BugSpeciesId[];
  /**
   * The species of the specimen brought home alive (#1179): a capture
   * objective whose specimen was extracted. The story's consequence
   * rules read it (Live Specimen opens Act II). Absent when the mission
   * wanted no specimen or none came home.
   */
  readonly specimenCaptured?: BugSpeciesId;
  /**
   * How each of the mission's objectives ended (ADR 0013 §2.3), in the
   * mission's objective order, for the consequence rules. The tactical
   * resolver fills it from the finished mission, and leaves it out when
   * the mission had none.
   *
   * Absent means nobody played the objectives: the auto-resolver rolls
   * an outcome and nothing else, so a rule reading this must fall back
   * to `outcome` when it is undefined.
   */
  readonly objectives?: readonly ObjectiveResult[];
}

/**
 * How one tactical objective ended (ADR 0013 §2.3). Plain data with the
 * kind as a string, so the overworld reads it without importing the
 * tactical layer's types.
 *
 * ```
 *   { kind: "defend-generators", complete: true, failed: false, done: 2, total: 3 }
 * ```
 */
export interface ObjectiveResult {
  /** The tactical objective kind, e.g. `"destroy-spawner"`. */
  readonly kind: string;
  /** Done by the kind's rule at the end of the mission. */
  readonly complete: boolean;
  /** Lost: it could no longer be done, by its rule or its deadline. */
  readonly failed: boolean;
  /** How far it got in the kind's own unit, when the kind keeps a count. */
  readonly done?: number;
  /** Out of how many, beside `done`. */
  readonly total?: number;
}

/** How a defend-installation mission left its installation (#1175). */
export interface MissionResultDefence {
  readonly installation: DeployableTypeId;
  readonly held: boolean;
}
