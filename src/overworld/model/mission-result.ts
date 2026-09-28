import type { BugSpeciesId } from "../../content/model/bug-species-id";
import type { InstallationSiteId } from "../../content/model/installation-site-id";
import type { MechId } from "../../roster/model/mech";
import type { PartId } from "../../roster/model/mech-part";
import type { SquadId } from "../../roster/model/squad";
import type { CityId } from "./city";
import type { MissionId } from "./mission";
import type { NemesisWound } from "./nemesis";

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

/**
 * Whether the force held the field at the end: every outcome but `lost`.
 * What happens to a mech destroyed there turns on it, and on nothing
 * else, so each destroyed mech is paid for exactly once (arc §6.6,
 * GDD §5.7):
 *
 * ```
 *   won, extracted ──► held    ──► salvage: a share of its price in credits
 *   lost           ──► not held ──► a wreck, which Wreck Recovery may strip for its parts
 * ```
 *
 * @param outcome - How the mission ended.
 */
export function heldTheField(outcome: MissionOutcome): boolean {
  return outcome !== "lost";
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
 *                 ├─ salvageCredits? ────────────────► economy, set by the launch handler (#1179)
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
   * Whole credits paid back for the mechs destroyed on a field the force
   * held (GDD §5.7, #1179), apart from `creditsAwarded`: a share of each
   * mech's price. The launch handler sets it from the salvage rule; a
   * resolver never does. Absent when none was paid, which a lost
   * mission's is: its wrecks are Wreck Recovery's (arc §6.6).
   */
  readonly salvageCredits?: number;
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
   * Parts paid into the stock, repeats kept (arc §6.6): the offer's
   * `rewards.parts` on a win, and nothing otherwise. The launch handler
   * hands them to the roster. Absent when none were.
   */
  readonly partsAwarded?: readonly PartId[];
  /**
   * The part of `techPointsAwarded` paid as bounties for optional targets
   * wrecked on the way (the Hive Assault's chamber nests, campaign arc
   * §6.5), so the debrief can say so. Absent when none was.
   */
  readonly techPointsBounty?: number;
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
  /** For a wreck recovery (arc §6.6): how far the stripping got. */
  readonly wreck?: MissionResultWreck;
  /**
   * For a crash site (campaign arc §6.3): true when the squad wrecked the
   * spore pod before it matured, false when it matured or was left
   * standing. Absent when the mission had no pod, or nobody played it.
   */
  readonly podDestroyed?: boolean;
  /**
   * For a Hive Assault (campaign arc §6.5): true when the squad brought
   * the hive core down, whether or not it then got out. Absent when the
   * mission had no core. The consequence rule reads the outcome; this is
   * for the debrief's tagline.
   */
  readonly hiveCoreDestroyed?: boolean;
  /**
   * For Intact Pod (#1179, campaign arc §6.9): true when the drop ship
   * lifted the spore pod alive at the recovery turn, false when it was
   * destroyed or the mission ended before the drop. Absent when the
   * mission had no pod to save. The story reads the outcome; this is for
   * the debrief's tagline.
   */
  readonly podRecovered?: boolean;
  /**
   * For Intact Pod: the pod's hit points as it was lifted, or where it
   * stood when the mission ended (0 once destroyed). Absent beside an
   * absent `podRecovered`.
   */
  readonly podHpLeft?: number;
  /**
   * For a rescue (campaign arc §6.4): civilian groups aboard the drop
   * ship at the end, beside `civiliansTotal`. Each group out adds to the
   * reward. Absent when the mission had no civilians.
   */
  readonly civiliansRescued?: number;
  /** For a rescue: how many civilian groups the mission had, beside `civiliansRescued`. */
  readonly civiliansTotal?: number;
  /**
   * For a tunnel sabotage (arc §6.7): tunnel mouths whose charge went
   * off and sealed them, beside `tunnelsTotal`. Absent when the mission
   * had no tunnel mouths.
   */
  readonly tunnelsSealed?: number;
  /** For a tunnel sabotage: how many tunnel mouths the map had, beside `tunnelsSealed`. */
  readonly tunnelsTotal?: number;
  /**
   * For an Alpha Hunt (campaign arc §6.8): true when the Broodmother
   * died on the map. Absent when the mission had no hunt, or nobody
   * played it (auto-resolve), which the consequence rule reads as the
   * outcome instead.
   */
  readonly broodmotherKilled?: boolean;
  /** For an Alpha Hunt: true when she fled off the map edge. */
  readonly broodmotherEscaped?: boolean;
  /**
   * For an Alpha Hunt the squad did not finish: what last hurt her,
   * which the nemesis record turns into her scar. Absent when she was
   * never wounded, or she died.
   */
  readonly broodmotherWound?: NemesisWound;
  /**
   * The named alpha of an Alpha Present mission (campaign arc §11), once
   * one was crowned: its species, whether it lived, and what last hurt
   * it. The launch handler records a survivor of a mission the squad did
   * not win as a nemesis. Absent when no bug was crowned.
   */
  readonly alpha?: MissionResultAlpha;
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
  /**
   * How each stage of a linked mission went (ADR 0013 amendment,
   * #1179), in play order, for the debrief: every stage won but the
   * last, which ended as `outcome` says. The mission's other fields are
   * already the whole mission's; this only says where it was decided.
   * Absent on a one-map mission, so such a result is exactly what it
   * was before.
   */
  readonly stages?: readonly MissionStageResult[];
}

/**
 * How one stage of a linked mission ended (ADR 0013 amendment): which
 * stage, how, and on what turn.
 */
export interface MissionStageResult {
  /** Zero-based stage index. */
  readonly index: number;
  readonly outcome: MissionOutcome;
  /** The turn the stage ended on. */
  readonly turns: number;
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
  /** The facility that was defended: a built installation or a story facility. */
  readonly installation: InstallationSiteId;
  readonly held: boolean;
}

/**
 * How far a wreck recovery's stripping got (arc §6.6): the turns a squad
 * spent on the wreck, out of the turns it takes, and whether the parts
 * came off. Stripped is not recovered: the parts only come home with a
 * win, which needs the squad that stripped them to extract.
 */
export interface MissionResultWreck {
  /** True once the wreck was worked for every turn it takes. */
  readonly stripped: boolean;
  readonly turnsWorked: number;
  readonly turnsNeeded: number;
}

// ===========================================
// Named alpha
// ===========================================

/**
 * How the named alpha of an Alpha Present mission ended (campaign arc
 * §11). Its name, level and nemesis id are on the offer's
 * `Mission.alpha`; the result carries only what the map decided.
 */
export interface MissionResultAlpha {
  /** The species of the bug that was crowned. */
  readonly speciesId: BugSpeciesId;
  /** True unless it died on the map. */
  readonly survived: boolean;
  /** What last hurt it, when anything did and it lived. */
  readonly wound?: NemesisWound;
}
