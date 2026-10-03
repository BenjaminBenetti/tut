import { err } from "../../core/model/result";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { CommandHandler } from "../../overworld/model/command-handler";
import type { Deployment } from "../../overworld/model/deployment";
import { MAX_DEPLOYED_UNITS } from "../../overworld/model/deployment";
import type { LaunchMissionCommand } from "../../overworld/model/launch-mission-command";
import { launchMission } from "../../overworld/model/launch-mission-command";
import type { MissionId } from "../../overworld/model/mission";
import type { RosterState } from "../../roster/model/roster-state";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import { tacticalRefusal } from "../model/tactical-error";
import type { WinMissionInstantlyCommand } from "../model/win-mission-instantly-command";
import { WIN_MISSION_INSTANTLY } from "../model/win-mission-instantly-command";

// ===========================================
// Types
// ===========================================

/** What the `WinMissionInstantly` handler needs injected. */
export interface WinMissionInstantlyDeps<TState extends MissionCampaignState> {
  /**
   * `LaunchMission` built over `InstantWinMissionResolver`: the same
   * handler, consequence rules and story as every launch, over a
   * resolver that wins. Handed in so the instant win is one command,
   * one store change and one autosave, as `FinishMission` is.
   */
  readonly launch: CommandHandler<TState, LaunchMissionCommand>;
  /**
   * Whether this is a dev build (#1235). False registers the handler
   * refusing, so the command exists in every build and does something
   * only where it should, as `PlaceUnit` does (#1136).
   */
  readonly enabled: boolean;
}

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `WinMissionInstantly` handler (#1235): the dev build's
 * shortcut past a mission. It settles an offer as won through the
 * launch handler it is given, with `instantWinDeployment` as the force.
 *
 * ```
 *   not a dev build ────────────► err debug-disabled
 *   a mission is in progress ───► err mission-active
 *          │
 *   launch(state, LaunchMission { missionId, instantWinDeployment(roster) })
 *          ├── err ──► that CommandError (no such offer, expired, empty roster)
 *          └── ok  ──► the win applied: rewards, consequences, story, lastMissionResult
 * ```
 *
 * It refuses while a mission is in progress because the overworld and
 * the tactical layer would then disagree about that mission: settling
 * the offer the live mission was launched from would leave
 * `FinishMission` nothing to resolve, and the campaign stuck in it.
 */
export function createWinMissionInstantlyHandler<
  TState extends MissionCampaignState,
>(
  deps: WinMissionInstantlyDeps<TState>,
): CommandHandler<TState, WinMissionInstantlyCommand> {
  return (state, command, ctx) => {
    if (!deps.enabled) {
      return err(tacticalRefusal({ kind: "debug-disabled" }));
    }
    const active = state.activeMission;
    if (active !== undefined) {
      return err(
        tacticalRefusal({ kind: "mission-active", missionId: active.missionId }),
      );
    }
    const { missionId } = command.payload;
    return deps.launch(
      state,
      launchMission(missionId, instantWinDeployment(missionId, state.roster)),
      ctx,
    );
  };
}

/** Registers the `WinMissionInstantly` handler on `dispatcher`. Called once at the composition root. */
export function registerWinMissionInstantly<
  TState extends MissionCampaignState,
>(
  dispatcher: CommandDispatcher<TState>,
  deps: WinMissionInstantlyDeps<TState>,
): void {
  dispatcher.register(
    WIN_MISSION_INSTANTLY,
    createWinMissionInstantlyHandler<TState>(deps),
  );
}

// ===========================================
// Who counts as deployed
// ===========================================

/**
 * The force an instant win counts as deployed: every squad, then every
 * mech, in roster order, up to `MAX_DEPLOYED_UNITS`. That is the most a
 * player could send, so the win is credited as the whole force's: each
 * unit sent is a survivor and earns a mission's experience, as it would
 * have coming home from the map. Nobody is lost, because the instant-win
 * resolver reports no casualties and no damage. An empty roster sends
 * nobody, and the launch refuses that as it refuses any empty
 * deployment.
 *
 * @param missionId - The offer being won.
 * @param roster - The roster's squads and mechs as they stand.
 * @returns The deployment the launch is made with.
 */
export function instantWinDeployment(
  missionId: MissionId,
  roster: Pick<RosterState, "squads" | "mechs">,
): Deployment {
  const squadIds = roster.squads
    .slice(0, MAX_DEPLOYED_UNITS)
    .map((squad) => squad.id);
  const mechIds = roster.mechs
    .slice(0, MAX_DEPLOYED_UNITS - squadIds.length)
    .map((mech) => mech.id);
  return { missionId, squadIds, mechIds };
}
