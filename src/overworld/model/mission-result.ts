import type { MechId } from "../../roster/model/mech";
import type { SquadId } from "../../roster/model/squad";
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
}

/** Damage one deployed mech took. */
export interface MechDamageReport {
  readonly mechId: MechId;
  /** Damage added, `>= 0`, on the mech's `0..MECH_MAX_DAMAGE` scale. */
  readonly damage: number;
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
 *                 ├─ infestationDelta ───────────────► host city
 *                 └─ intel? ─────────────────────────► reserved (#52 sensor array)
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
   * Signed integer added to the host city's infestation; negative on a
   * successful clearance. The applier clamps to the city's bounds.
   */
  readonly infestationDelta: number;
  /**
   * Intel points unlocked by the mission (GDD §6.5). Reserved for the
   * sensor array deployable's `intelBonus` (#52); never set in M1.
   */
  readonly intel?: number;
}
