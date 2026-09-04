import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { Deployment } from "../../overworld/model/deployment";
import type { LaunchMissionCommand } from "../../overworld/model/launch-mission-command";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { FinishMissionCommand } from "../model/finish-mission-command";
import { FINISH_MISSION } from "../model/finish-mission-command";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import { describeTacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";

// ===========================================
// Types
// ===========================================

/** What the `FinishMission` handler needs injected. */
export interface FinishMissionDeps<TState extends MissionCampaignState> {
  /**
   * `LaunchMission` (#67), which resolves the mission through the
   * injected `MissionResolver` and applies the result across roster,
   * economy and map. Handed in rather than dispatched so the whole
   * debrief is one command, one store change and one autosave.
   */
  readonly launch: CommandHandler<TState, LaunchMissionCommand>;
}

/** `CommandError.code` when there is no mission in progress to finish. */
export const NO_ACTIVE_MISSION = "no-active-mission";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `FinishMission` handler (#341): the other end of
 * `StartMission`. The tactical screen dispatches it when the mission
 * reports an outcome, and it hands the finished mission to
 * `LaunchMission`, whose resolver is `TacticalMissionResolver` in M2
 * (#330), then empties `activeMission`.
 *
 * ```
 *   no activeMission ────────────► err no-active-mission
 *   a different mission is live ─► err mission-mismatch
 *   outcome not yet set ─────────► err mission-not-over
 *          │
 *   launch(state, LaunchMission { missionId, deploymentOf(mission) })
 *          ├── err ──► that CommandError; the mission stays in progress
 *          └── ok  ──► result applied, activeMission cleared, its events
 * ```
 *
 * The deployment is read back off the mission rather than remembered
 * between the two commands: every deployed unit was placed as a token at
 * mission start, so the tokens on the map and in `extracted` name exactly
 * the force that was sent.
 */
export function createFinishMissionHandler<
  TState extends MissionCampaignState,
>(deps: FinishMissionDeps<TState>): CommandHandler<TState, FinishMissionCommand> {
  return (state, command, ctx) => {
    const mission = state.activeMission;
    if (mission === undefined) {
      return err(
        commandError(
          NO_ACTIVE_MISSION,
          describeTacticalError({ kind: "no-active-mission" }),
        ),
      );
    }
    const { missionId } = command.payload;
    if (mission.missionId !== missionId) {
      return err(
        commandError(
          "mission-mismatch",
          describeTacticalError({
            kind: "mission-mismatch",
            expected: missionId,
            active: mission.missionId,
          }),
        ),
      );
    }
    if (mission.outcome === undefined) {
      return err(
        commandError(
          "mission-not-over",
          describeTacticalError({ kind: "mission-not-over", missionId }),
        ),
      );
    }
    const applied = deps.launch(
      state,
      launchMission(missionId, deploymentOf(mission)),
      ctx,
    );
    if (!applied.ok) {
      return applied;
    }
    return ok({
      state: { ...applied.value.state, activeMission: undefined },
      events: applied.value.events,
    });
  };
}

/** Registers the `FinishMission` handler on `dispatcher`. Called once at the composition root. */
export function registerFinishMission<TState extends MissionCampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: FinishMissionDeps<TState>,
): void {
  dispatcher.register(FINISH_MISSION, createFinishMissionHandler<TState>(deps));
}

// ===========================================
// Helpers
// ===========================================

/**
 * The force that was sent, read back off the mission: every TDF token on
 * the map or already extracted, by the roster entry it came from, in
 * `units` order. Mission start places one token per deployed squad and
 * mech and refuses the launch if it cannot, so this is the deployment
 * the launch was made with.
 */
export function deploymentOf(mission: TacticalState): Deployment {
  const squadIds: string[] = [];
  const mechIds: string[] = [];
  for (const unit of [...mission.units, ...mission.extracted]) {
    if (unit.team !== "tdf") {
      continue;
    }
    if (unit.kind === "squad") {
      squadIds.push(unit.sourceId);
    } else if (unit.kind === "mech") {
      mechIds.push(unit.sourceId);
    }
  }
  return { missionId: mission.missionId, squadIds, mechIds };
}
