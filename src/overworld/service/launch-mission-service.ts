import type { CommandError } from "../../core/model/command-error";
import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { TechPointService } from "../../economy/model/tech-point-service";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CasualtyReport } from "../../roster/model/casualty-report";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import { applyCasualties } from "../../roster/service/roster-casualty-service";
import { stockParts } from "../../roster/service/part-stock-service";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { City } from "../model/city";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler } from "../model/command-handler";
import type { Deployment } from "../model/deployment";
import type { HiveTuning } from "../model/hive-tuning";
import { deploymentSize, MAX_DEPLOYED_UNITS } from "../model/deployment";
import type { LaunchMissionCommand } from "../model/launch-mission-command";
import { LAUNCH_MISSION } from "../model/launch-mission-command";
import type { Mission, MissionId } from "../model/mission";
import { isMissionExpired } from "../model/mission";
import type { MissionConsequenceRules } from "../model/mission-consequence-rule";
import type { MissionResolver } from "../model/mission-resolver";
import type { MissionResult } from "../model/mission-result";
import { MISSION_RESOLVED } from "../model/mission-resolved-event";
import type { MissionTuning } from "../model/mission-tuning";
import type { OverworldState } from "../model/overworld-state";
import { recordMission } from "./campaign-progress-service";
import { findCity } from "./earth-map-query-service";
import type { StoryDeps } from "./story-service";
import { onStoryMissionResolved } from "./story-service";
import { recordWrecks } from "./wreck-service";

// ===========================================
// Types
// ===========================================

/** Services the launch handler closes over; `rng` and `ids` come from the command context. */
export interface LaunchMissionDeps {
  /** Plays the mission out: the auto-resolver in M1, the tactical layer in M2. */
  readonly resolver: MissionResolver;
  /** Mission experience and repair pricing for the casualty bookkeeping (#64). */
  readonly rosterTuning: RosterTuning;
  /**
   * Builds the transaction service for one command over the context's
   * id generator, so reward ledger ids share the campaign's counters.
   */
  readonly transactionsFor: (ids: IdGenerator) => TransactionService;
  /** The one door tech points move through (#1171). */
  readonly techPoints: TechPointService;
  /** What each mission type does to the overworld once played (ADR 0013 §2.3). */
  readonly consequences: MissionConsequenceRules;
  /** Handed to the consequence rules; the clearance's mop-up threshold lives here. */
  readonly missionTuning: MissionTuning;
  /** Handed to the consequence rules; a won Hive Assault liberates with it. */
  readonly hiveTuning: HiveTuning;
  /**
   * The story missions built so far and each act's gate: a played story
   * offer is resolved by the story service after its type's consequence
   * rule (ADR 0013 §2.5).
   */
  readonly story: StoryDeps;
}

/** What a valid launch resolved to: the mission and its host city. */
export interface ValidatedLaunch {
  readonly mission: Mission;
  readonly city: City;
}

// ===========================================
// Error codes
// ===========================================

/** `deployment.missionId` disagrees with the command's `missionId`. */
export const DEPLOYMENT_MISMATCH = "deployment-mismatch";
/** No mission with that id is on offer. */
export const MISSION_NOT_FOUND = "mission-not-found";
/** The mission's expiry day has arrived and it is not pinned. */
export const MISSION_EXPIRED = "mission-expired";
/** The deployment names no units at all. */
export const EMPTY_DEPLOYMENT = "empty-deployment";
/** The deployment names more units than a deploy zone can hold (#487). */
export const OVERSIZED_DEPLOYMENT = "oversized-deployment";
/** A squad or mech in the deployment is not in the roster. */
export const UNKNOWN_UNIT = "unknown-unit";
/** A unit is committed twice in the same deployment. */
export const DUPLICATE_UNIT = "duplicate-unit";
/** The mission's host city is not on the map: a content or save bug. */
export const MISSION_CITY_MISSING = "mission-city-missing";

// ===========================================
// Validation
// ===========================================

/**
 * Checks a launch before anything is rolled: the deployment targets the
 * named mission, the mission is on offer and not expired (a pinned
 * offer never is), at least one unit goes, no unit goes twice, every
 * unit is in the roster, and the host city exists. Returns the first
 * problem as a typed error.
 */
export function validateLaunch(
  state: CampaignState,
  missionId: MissionId,
  deployment: Deployment,
): Result<ValidatedLaunch, CommandError> {
  if (deployment.missionId !== missionId) {
    return err(
      commandError(
        DEPLOYMENT_MISMATCH,
        `Deployment targets mission "${deployment.missionId}" but "${missionId}" was launched`,
      ),
    );
  }
  const mission = state.overworld.missions.find((m) => m.id === missionId);
  if (mission === undefined) {
    return err(
      commandError(MISSION_NOT_FOUND, `No mission "${missionId}" is on offer`),
    );
  }
  if (isMissionExpired(mission, state.overworld.day)) {
    return err(
      commandError(
        MISSION_EXPIRED,
        `Mission "${missionId}" expired on day ${mission.expiresDay}`,
      ),
    );
  }
  const size = deploymentSize(deployment);
  if (size === 0) {
    return err(
      commandError(EMPTY_DEPLOYMENT, "A deployment needs at least one unit"),
    );
  }
  if (size > MAX_DEPLOYED_UNITS) {
    return err(
      commandError(
        OVERSIZED_DEPLOYMENT,
        `A deployment carries at most ${String(MAX_DEPLOYED_UNITS)} units, but ${String(size)} were sent`,
      ),
    );
  }
  const repeated =
    firstDuplicate(deployment.squadIds) ?? firstDuplicate(deployment.mechIds);
  if (repeated !== undefined) {
    return err(
      commandError(
        DUPLICATE_UNIT,
        `Unit "${repeated}" is committed twice in the same deployment`,
      ),
    );
  }
  for (const squadId of deployment.squadIds) {
    if (!state.roster.squads.some((squad) => squad.id === squadId)) {
      return err(
        commandError(UNKNOWN_UNIT, `Squad "${squadId}" is not in the roster`),
      );
    }
  }
  for (const mechId of deployment.mechIds) {
    if (!state.roster.mechs.some((mech) => mech.id === mechId)) {
      return err(
        commandError(UNKNOWN_UNIT, `Mech "${mechId}" is not in the roster`),
      );
    }
  }
  const city = findCity(state.overworld.map, mission.cityId);
  if (city === undefined) {
    return err(
      commandError(
        MISSION_CITY_MISSING,
        `Mission "${missionId}" is attached to unknown city "${mission.cityId}"`,
      ),
    );
  }
  return ok({ mission, city });
}

// ===========================================
// Handler
// ===========================================

/**
 * Builds the `LaunchMission` handler. After validation the mission is
 * resolved on a stream forked per mission (`mission:<id>`), so the same
 * campaign seed and mission always play out the same way whenever they
 * are launched, and the result is applied in this order:
 *
 * ```
 *   validateLaunch ──err──► CommandError (nothing rolled, nothing changed)
 *        │ok
 *   result = resolver.resolve(mission, deployment, { squads, mechs, city }, fork)
 *        │   consequences[mission.typeId].settle? ──► its credits and delta laid over
 *        │                                           (an evacuation's per-group credits)
 *   1. MissionResolved { result }
 *   2. roster  ── applyCasualties ──► losses, damage, wipes, graveyard, xp   (roster events)
 *              ── stockParts(partsAwarded) ──► recovered parts (arc §6.6)  (PartsStocked)
 *   3. economy ── earn(creditsAwarded, "reward", mission.id)                 (CreditsChanged)
 *   4. mission removed from the offers; lastMissionResult := result
 *   5. progress ── recordMission(outcome, speciesKilled): missionsPlayed,
 *                 missionsWon on a win, first kills (ADR 0013 §2.1)
 *      wrecks  ── recordWrecks: a lost mission's destroyed mechs, read from
 *                 the roster as it stood at launch, await Wreck Recovery;
 *                 records past their offer window are dropped (arc §6.6)
 *   6. overworld ── consequences[mission.typeId].onResolved(overworld,      (the rule's events,
 *                 mission, result): the type's own effect, e.g. the         e.g. CityInfestationChanged)
 *                 clearance's infestation cut and mop-up (ADR 0013 §2.3)
 *   7. story     ── storyId set? onStoryMissionResolved: a win applies the   (CampaignFlagSet,
 *                 rule's onWon (flags, the next act, victory), a loss its   ActAdvanced, HiveFormed,
 *                 onLost (retry delay, D7) (ADR 0013 §2.5)                  CityInfestationChanged)
 * ```
 *
 * This is the single place the campaign counts missions: every resolved
 * mission, won, extracted or lost, passes through here exactly once. The
 * consequence rule and then the story run last, on an overworld that no
 * longer holds the offer and has already counted the mission, so the
 * story may move the act on, and the type's rule and the story layer
 * stay separate: a story Crash Site still has the Crash Site
 * consequences.
 *
 * Resolver-agnostic: M2 swaps the auto-resolver for the tactical layer
 * without touching this service.
 */
export function createLaunchMissionHandler<TState extends CampaignState>(
  deps: LaunchMissionDeps,
): CommandHandler<TState, LaunchMissionCommand> {
  return (state, command, ctx) => {
    const { missionId, deployment } = command.payload;
    const validated = validateLaunch(state, missionId, deployment);
    if (!validated.ok) {
      return validated;
    }
    const { mission, city } = validated.value;
    const day = state.overworld.day;

    const rule = deps.consequences[mission.typeId];
    const consequenceCtx = {
      tuning: deps.missionTuning,
      hive: deps.hiveTuning,
    };
    const resolved = deps.resolver.resolve(
      mission,
      deployment,
      { squads: state.roster.squads, mechs: state.roster.mechs, city },
      ctx.rng.fork(`mission:${mission.id}`),
    );
    const result: MissionResult =
      rule.settle === undefined
        ? resolved
        : { ...resolved, ...rule.settle(mission, resolved, consequenceCtx) };
    const events: CampaignEvent[] = [
      { type: MISSION_RESOLVED, payload: { result } },
    ];

    const casualties = applyCasualties(
      state.roster,
      toCasualtyReport(result, deployment),
      day,
      deps.rosterTuning,
    );
    events.push(...casualties.events);
    const stocked = stockParts(
      casualties.roster,
      result.partsAwarded ?? [],
      mission.id,
    );
    events.push(...stocked.events);

    let economy = state.economy;
    if (result.creditsAwarded > 0) {
      const paid = deps
        .transactionsFor(ctx.ids)
        .earn(economy, result.creditsAwarded, "reward", mission.id, day);
      economy = paid.state;
      events.push(...paid.events);
    }
    if (result.techPointsAwarded > 0) {
      const earned = deps.techPoints.earn(
        economy,
        result.techPointsAwarded,
        mission.id,
        day,
      );
      economy = earned.state;
      events.push(...earned.events);
    }

    // The wrecks are read from `state.roster`, which still holds the
    // mechs `applyCasualties` just removed.
    const settled: OverworldState = recordWrecks(
      {
        ...state.overworld,
        missions: state.overworld.missions.filter((m) => m.id !== mission.id),
        lastMissionResult: result,
        progress: recordMission(
          state.overworld.progress,
          result.outcome,
          result.speciesKilled ?? [],
        ),
      },
      mission,
      result,
      state.roster.mechs,
      deps.missionTuning.wreck,
    );
    const consequence = rule.onResolved(
      settled,
      mission,
      result,
      consequenceCtx,
    );
    events.push(...consequence.events);
    const story = onStoryMissionResolved(consequence.state, mission, result, {
      ...deps.story,
      ids: ctx.ids,
    });
    events.push(...story.events);

    return ok({
      state: {
        ...state,
        overworld: story.state,
        roster: stocked.roster,
        economy,
      },
      events,
    });
  };
}

/** Registers the `LaunchMission` handler on `dispatcher`. Called once at the composition root. */
export function registerLaunchMission<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: LaunchMissionDeps,
): void {
  dispatcher.register(LAUNCH_MISSION, createLaunchMissionHandler<TState>(deps));
}

// ===========================================
// Helpers
// ===========================================

/** The roster's view of a result: its reports plus who deployed, so unhurt survivors are credited. */
function toCasualtyReport(
  result: MissionResult,
  deployment: Deployment,
): CasualtyReport {
  return {
    missionId: result.missionId,
    cityId: result.cityId,
    squadCasualties: result.squadCasualties,
    squadsWiped: result.squadsWiped,
    mechsDestroyed: result.mechsDestroyed,
    mechDamage: result.mechDamage,
    deployedSquadIds: deployment.squadIds,
    deployedMechIds: deployment.mechIds,
  };
}

/** The first id that appears more than once, or undefined. */
function firstDuplicate(ids: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      return id;
    }
    seen.add(id);
  }
  return undefined;
}
