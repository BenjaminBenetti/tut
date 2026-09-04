import type { CommandError } from "../../core/model/command-error";
import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CasualtyReport } from "../../roster/model/casualty-report";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import { applyCasualties } from "../../roster/service/roster-casualty-service";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { City } from "../model/city";
import { clampInfestation } from "../model/city";
import { CITY_INFESTATION_CHANGED } from "../model/city-infestation-changed-event";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler } from "../model/command-handler";
import type { Deployment } from "../model/deployment";
import { deploymentSize, MAX_DEPLOYED_UNITS } from "../model/deployment";
import type { LaunchMissionCommand } from "../model/launch-mission-command";
import { LAUNCH_MISSION } from "../model/launch-mission-command";
import type { Mission, MissionId } from "../model/mission";
import type { MissionResolver } from "../model/mission-resolver";
import type { MissionResult } from "../model/mission-result";
import { MISSION_RESOLVED } from "../model/mission-resolved-event";
import { findCity } from "./earth-map-query-service";

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
/** The mission's expiry day has arrived. */
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
 * named mission, the mission is on offer and not expired, at least one
 * unit goes, no unit goes twice, every unit is in the roster, and the
 * host city exists. Returns the first problem as a typed error.
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
  if (state.overworld.day >= mission.expiresDay) {
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
 *        │
 *   1. MissionResolved { result }
 *   2. roster  ── applyCasualties ──► losses, damage, wipes, graveyard, xp   (roster events)
 *   3. economy ── earn(creditsAwarded, "reward", mission.id)                 (CreditsChanged)
 *   4. map     ── city.infestation += infestationDelta, clamped              (CityInfestationChanged)
 *   5. mission removed from the offers; lastMissionResult := result
 * ```
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

    const result = deps.resolver.resolve(
      mission,
      deployment,
      { squads: state.roster.squads, mechs: state.roster.mechs, city },
      ctx.rng.fork(`mission:${mission.id}`),
    );
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

    let economy = state.economy;
    if (result.creditsAwarded > 0) {
      const paid = deps
        .transactionsFor(ctx.ids)
        .earn(economy, result.creditsAwarded, "reward", mission.id, day);
      economy = paid.state;
      events.push(...paid.events);
    }

    const cities = state.overworld.map.cities.map((candidate): City => {
      if (candidate.id !== city.id) {
        return candidate;
      }
      const to = clampInfestation(
        candidate.infestation + result.infestationDelta,
      );
      if (to === candidate.infestation) {
        return candidate;
      }
      events.push({
        type: CITY_INFESTATION_CHANGED,
        payload: { cityId: candidate.id, from: candidate.infestation, to },
      });
      return { ...candidate, infestation: to };
    });

    return ok({
      state: {
        ...state,
        overworld: {
          ...state.overworld,
          map: { regions: state.overworld.map.regions, cities },
          missions: state.overworld.missions.filter((m) => m.id !== mission.id),
          lastMissionResult: result,
        },
        roster: casualties.roster,
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
