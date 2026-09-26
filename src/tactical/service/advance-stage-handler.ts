import { err, ok } from "../../core/model/result";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { AdvanceStageCommand } from "../model/advance-stage-command";
import { ADVANCE_STAGE } from "../model/advance-stage-command";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { StageAdvancer } from "../model/stage-advancer";
import { tacticalRefusal } from "../model/tactical-error";

// ===========================================
// Types
// ===========================================

/** What the `AdvanceStage` handler needs injected. */
export interface AdvanceStageDeps {
  /** Builds the next stage; the M2 resolver in the shipped game. */
  readonly advancer: StageAdvancer;
}

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `AdvanceStage` handler (ADR 0013 amendment, #1179): the
 * transition screen's Continue. It hands a linked mission's won stage
 * to the advancer, which stands the survivors on the next map.
 *
 * ```
 *   no activeMission ────────────► err no-active-mission
 *   a different mission is live ─► err mission-mismatch
 *   advancer.advanceStage(state, ctx.ids)
 *          ├── err ──► that refusal (no-stage-to-advance, no-deploy-room, …)
 *          └── ok  ──► { ...state, activeMission: the next stage }
 * ```
 *
 * No events: the next stage opens with its own `TurnStarted`, and the
 * tactical screen renders from `activeMission` on the store change. The
 * ids the stage consumed are written back to `meta` by the dispatcher.
 */
export function createAdvanceStageHandler<TState extends MissionCampaignState>(
  deps: AdvanceStageDeps,
): CommandHandler<TState, AdvanceStageCommand> {
  return (state, command, ctx) => {
    const mission = state.activeMission;
    if (mission === undefined) {
      return err(tacticalRefusal({ kind: "no-active-mission" }));
    }
    const { missionId } = command.payload;
    if (mission.missionId !== missionId) {
      return err(
        tacticalRefusal({
          kind: "mission-mismatch",
          expected: missionId,
          active: mission.missionId,
        }),
      );
    }
    const advanced = deps.advancer.advanceStage(state, ctx.ids);
    if (!advanced.ok) {
      return err(tacticalRefusal(advanced.error));
    }
    return ok({ state: advanced.value, events: [] });
  };
}

/** Registers the `AdvanceStage` handler on `dispatcher`. Called once at the composition root. */
export function registerAdvanceStage<TState extends MissionCampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: AdvanceStageDeps,
): void {
  dispatcher.register(ADVANCE_STAGE, createAdvanceStageHandler<TState>(deps));
}
