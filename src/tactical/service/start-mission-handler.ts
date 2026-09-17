import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { MissionId } from "../../overworld/model/mission";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { MissionStartOptions } from "../model/mission-start-options";
import type { MissionStarter } from "../model/mission-starter";
import type { StartMissionCommand } from "../model/start-mission-command";
import { START_MISSION } from "../model/start-mission-command";
import { tacticalRefusal } from "../model/tactical-error";

// ===========================================
// Types
// ===========================================

/** What the `StartMission` handler needs injected. */
export interface StartMissionDeps {
  /** Begins the mission; the M2 resolver's first half (#330). */
  readonly starter: MissionStarter;
  /**
   * What the campaign knows about the mission beyond the deployment
   * (#1155): the region's garrison turret count, read from the
   * overworld at launch. Absent, or returning nothing, starts the
   * mission with no garrison.
   */
  readonly startOptionsFor?: (
    state: MissionCampaignState,
    missionId: MissionId,
  ) => MissionStartOptions | undefined;
}

/** `CommandError.code` when the deployment does not name the launched mission. */
export const DEPLOYMENT_MISMATCH = "deployment-mismatch";

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `StartMission` handler (#341): the deployment screen's
 * Launch in M2. It generates the mission's map, places the chosen force
 * and leaves the campaign with the mission in `activeMission`; the
 * tactical screen takes it from there and `FinishMission` resolves it.
 *
 * ```
 *   deployment.missionId ≠ missionId ──► err deployment-mismatch
 *          │
 *   starter.beginMission(state, missionId, deployment, ctx.ids, startOptionsFor?.(state, missionId))
 *          ├── err TacticalError ──► CommandError(kind, message)
 *          └── ok  ──► { ...state, activeMission }
 * ```
 *
 * No events: nothing has happened in the mission yet, and the tactical
 * screen renders from `activeMission` on the store change itself. The
 * ids the mission consumed are written back to `meta` by the dispatcher,
 * as for any command.
 */
export function createStartMissionHandler<TState extends MissionCampaignState>(
  deps: StartMissionDeps,
): CommandHandler<TState, StartMissionCommand> {
  return (state, command, ctx) => {
    const { missionId, deployment } = command.payload;
    if (deployment.missionId !== missionId) {
      return err(
        commandError(
          DEPLOYMENT_MISMATCH,
          `Deployment targets mission "${deployment.missionId}" but "${missionId}" was started`,
        ),
      );
    }
    const started = deps.starter.beginMission(
      state,
      missionId,
      deployment,
      ctx.ids,
      deps.startOptionsFor?.(state, missionId),
    );
    if (!started.ok) {
      return err(tacticalRefusal(started.error));
    }
    return ok({ state: started.value, events: [] });
  };
}

/** Registers the `StartMission` handler on `dispatcher`. Called once at the composition root. */
export function registerStartMission<TState extends MissionCampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: StartMissionDeps,
): void {
  dispatcher.register(START_MISSION, createStartMissionHandler<TState>(deps));
}
