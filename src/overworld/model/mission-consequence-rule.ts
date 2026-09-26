import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { Mission } from "./mission";
import type { MissionResult } from "./mission-result";
import type { MissionTuning } from "./mission-tuning";
import type { OverworldApplied } from "./overworld-domain-event";
import type { OverworldState } from "./overworld-state";

// ===========================================
// Context
// ===========================================

/** What a consequence rule may read beyond the overworld and the mission. */
export interface MissionConsequenceContext {
  /** Per-type knobs; the clearance's mop-up threshold lives here. */
  readonly tuning: MissionTuning;
}

// ===========================================
// Rule
// ===========================================

/**
 * What a mission of one type does to the overworld when it is played
 * or left to lapse (ADR 0013 §2.3). The launch handler and the expiry
 * step do everything every type shares (casualties, credits, tech
 * points, the mission count, removing the offer, `MissionExpired`) and
 * ask the rule for `mission.typeId` for the rest, so a new type is a new
 * module under `overworld/service/missions/` and one table entry.
 *
 * ```
 *   director       ──► MissionOffered ─────► onOffered?(overworld, mission)
 *   LaunchMission  ──► shared bookkeeping ──► onResolved(overworld, mission, result)
 *   mission-expiry ──► MissionExpired ─────► onExpired(overworld, mission)
 * ```
 *
 * Pure: each returns the next overworld and the events describing what
 * changed, never mutates its input, and draws nothing.
 */
export interface MissionConsequenceRule {
  /** The mission type this rule serves; equal to its table key. */
  readonly typeId: MissionTypeId;
  /**
   * What making the offer does to the overworld, for a type whose offer
   * is itself an event (a crash site's landing, arc §6.3). The director
   * calls it for every offer of the type, however it was made (pinned
   * story offer, trigger or board draw), after the decorators and before
   * the next offer is made, so later offers see its effect. Absent on a
   * type whose offer changes nothing.
   *
   * @param state - The overworld with the offer already on the board.
   * @param mission - The offer just made, decorated.
   * @param ctx - Tuning the rule may read.
   */
  onOffered?(
    state: OverworldState,
    mission: Mission,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState>;
  /**
   * What the played mission does to the overworld.
   *
   * @param state - The overworld with the offer already removed, the
   *   result recorded as `lastMissionResult` and the mission counted.
   * @param mission - The offer that was played.
   * @param result - What the resolver reported; `objectives` is absent
   *   when the mission was auto-resolved.
   * @param ctx - Tuning the rule may read.
   */
  onResolved(
    state: OverworldState,
    mission: Mission,
    result: MissionResult,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState>;
  /**
   * What leaving the offer to lapse costs.
   *
   * @param state - The overworld with the offer already removed.
   * @param mission - The offer that lapsed.
   * @param ctx - Tuning the rule may read.
   */
  onExpired(
    state: OverworldState,
    mission: Mission,
    ctx: MissionConsequenceContext,
  ): OverworldApplied<OverworldState>;
}

/**
 * One consequence rule per mission type. A `Record` over the closed
 * `MissionTypeId` union, so a type without a rule is a compile error.
 */
export type MissionConsequenceRules = Readonly<
  Record<MissionTypeId, MissionConsequenceRule>
>;
