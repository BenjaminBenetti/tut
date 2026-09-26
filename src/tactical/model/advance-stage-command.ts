import type { Command } from "../../core/model/command";
import type { MissionId } from "../../overworld/model/mission";

// ===========================================
// AdvanceStage
// ===========================================

/** Command type: the squad goes on from a won stage to the next (ADR 0013 amendment). */
export const ADVANCE_STAGE = "tactical:advance-stage";

/** Payload of `AdvanceStage`. */
export interface AdvanceStagePayload {
  /**
   * The mission expected to be in progress. A mismatch is refused, so a
   * stale dispatch cannot move the wrong mission on.
   */
  readonly missionId: MissionId;
}

/**
 * Carries the survivors of a won stage straight into the next stage of
 * a linked mission (#1179): no overworld turn, no repairs, no re-arm,
 * no swaps. The transition screen's one Continue dispatches it.
 */
export type AdvanceStageCommand = Command<
  typeof ADVANCE_STAGE,
  AdvanceStagePayload
>;

/** Builds an `AdvanceStage` command. */
export function advanceStage(missionId: MissionId): AdvanceStageCommand {
  return { type: ADVANCE_STAGE, payload: { missionId } };
}

// ===========================================
// Registration
// ===========================================
//
// Only into `OverworldCommandMap`, like `StartMission`: it replaces
// `activeMission` rather than acting inside it, and the mission it acts
// on already has an outcome, which the lifting adapter refuses.

declare module "../../overworld/model/overworld-command" {
  interface OverworldCommandMap {
    [ADVANCE_STAGE]: AdvanceStageCommand;
  }
}
