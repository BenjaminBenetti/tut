import type { PartId } from "../../roster/model/mech-part";
import type { AutoResolveTuning } from "../model/auto-resolve-tuning";
import type { Mission } from "../model/mission";
import type { MissionOutcome } from "../model/mission-result";

// ===========================================
// Types
// ===========================================

/**
 * The reward and penalty half of the auto-resolve tuning: what an
 * outcome pays and what it does to the host city. Split out so a
 * resolver that plays the mission for real (the tactical layer, #330)
 * pays on exactly the same scale as the M1 auto-resolver (#62) without
 * depending on its combat knobs (ADR 0003 §2.5).
 */
export type MissionRewardTuning = Pick<
  AutoResolveTuning,
  | "extractedRewardFraction"
  | "clearanceBase"
  | "clearancePerDifficulty"
  | "lossInfestationPenalty"
>;

// ===========================================
// Rewards
// ===========================================

/**
 * Whole credits paid for the outcome: full on a win, a fraction on
 * extraction, nothing on a loss (GDD §6.5).
 *
 * ```
 *   won       ──► mission.rewards.credits
 *   extracted ──► ⌊credits × extractedRewardFraction⌋
 *   lost      ──► 0
 * ```
 */
export function creditsFor(
  outcome: MissionOutcome,
  mission: Mission,
  tuning: Pick<MissionRewardTuning, "extractedRewardFraction">,
): number {
  switch (outcome) {
    case "won":
      return mission.rewards.credits;
    case "extracted":
      return Math.floor(
        mission.rewards.credits * tuning.extractedRewardFraction,
      );
    case "lost":
      return 0;
  }
}

/**
 * Whole tech points paid for the outcome (#1171): the mission's reward
 * on a win, a fraction on extraction, nothing on a loss, plus whatever
 * the squads harvested from a tech carcass. The harvest is kept on
 * every outcome but a loss: a squad that stripped the carcass and
 * extracted brings it home, one that was wiped does not.
 *
 * ```
 *   won       ──► mission.rewards.techPoints + harvested
 *   extracted ──► ⌊techPoints × extractedRewardFraction⌋ + harvested
 *   lost      ──► 0
 * ```
 */
export function techPointsFor(
  outcome: MissionOutcome,
  mission: Mission,
  tuning: Pick<MissionRewardTuning, "extractedRewardFraction">,
  harvested = 0,
): number {
  switch (outcome) {
    case "won":
      return mission.rewards.techPoints + harvested;
    case "extracted":
      return (
        Math.floor(
          mission.rewards.techPoints * tuning.extractedRewardFraction,
        ) + harvested
      );
    case "lost":
      return 0;
  }
}

/**
 * Parts paid into the stock for the outcome (arc §6.6): the offer's
 * `rewards.parts` on a win and nothing otherwise. Unlike credits and
 * tech there is no share for an extraction: a wreck recovery is only
 * won when the squad that stripped the wreck came home with the parts,
 * so anything short of a win left them on the map.
 *
 * ```
 *   won                ──► mission.rewards.parts (repeats kept), or []
 *   extracted, lost    ──► []
 * ```
 */
export function partsFor(
  outcome: MissionOutcome,
  mission: Mission,
): readonly PartId[] {
  return outcome === "won" ? (mission.rewards.parts ?? []) : [];
}

/**
 * Signed infestation change for the host city: clearance on a win, a
 * penalty on a loss, nothing either way on an extraction. The applier
 * clamps it to the city's bounds.
 *
 * ```
 *   won       ──► −(clearanceBase + clearancePerDifficulty × difficulty)
 *   extracted ──► 0
 *   lost      ──► +lossInfestationPenalty
 * ```
 */
export function infestationDeltaFor(
  outcome: MissionOutcome,
  mission: Mission,
  tuning: Pick<
    MissionRewardTuning,
    "clearanceBase" | "clearancePerDifficulty" | "lossInfestationPenalty"
  >,
): number {
  switch (outcome) {
    case "won":
      return -(
        tuning.clearanceBase +
        tuning.clearancePerDifficulty * mission.difficulty
      );
    case "extracted":
      return 0;
    case "lost":
      return tuning.lossInfestationPenalty;
  }
}
