import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import type { Rng } from "../../core/model/rng";
import type { Deployment } from "../../overworld/model/deployment";
import type { Mission, MissionId } from "../../overworld/model/mission";
import type { MissionResolutionState } from "../../overworld/model/mission-resolution-state";
import type { MissionResolver } from "../../overworld/model/mission-resolver";
import type {
  MechDamageReport,
  MissionResult,
  SquadCasualties,
} from "../../overworld/model/mission-result";
import {
  deployedMechs,
  deployedSquads,
} from "../../overworld/service/force-rating-service";
import type { MissionRewardTuning } from "../../overworld/service/mission-reward-service";
import {
  creditsFor,
  infestationDeltaFor,
} from "../../overworld/service/mission-reward-service";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { TacticalError } from "../model/tactical-error";
import type { TacticalState } from "../model/tactical-state";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Unit, UnitId, UnitKind } from "../model/unit";
import type { UnitTuning } from "../model/unit-tuning";
import type { MissionStartDeps } from "./mission-start-service";
import { startTacticalMission } from "./mission-start-service";
import { missionOutcome } from "./mission-end-service";

// ===========================================
// Types
// ===========================================

/** What turning a finished mission into a result needs injected. */
export interface MissionResultDeps {
  /**
   * Hit points one soldier is worth, the same `UnitTuning` value mission
   * start built the squad units with: a squad's losses are read back off
   * its hit points with it.
   */
  readonly hpPerSoldier: number;
  /** Reward and infestation scale, shared with the M1 auto-resolver (#62). */
  readonly tuning: MissionRewardTuning;
}

/** A finished mission and the launch it belongs to. */
export interface MissionResultInput {
  /** The played-out mission; its `outcome` is set once a terminal check found it over. */
  readonly tactical: TacticalState;
  /** The overworld mission, for its rewards and difficulty. */
  readonly mission: Mission;
  /** Who was sent. */
  readonly deployment: Deployment;
  /** The roster and city as they stood at launch. */
  readonly state: MissionResolutionState;
}

/**
 * Where the resolver finds the mission it has just played: the campaign's
 * `activeMission`, handed in by the composition root because a
 * `MissionResolver` is only given the overworld's slice of truth (#341
 * wires it to the store).
 */
export type FinishedMissionSource = (
  missionId: MissionId,
) => TacticalState | undefined;

/** What the tactical resolver needs injected. */
export interface TacticalResolveDeps {
  /** Mission-start dependencies over one command's id generator (#323). */
  readonly missionStartDepsFor: (ids: IdGenerator) => MissionStartDeps;
  /** Unit stat scale; the resolver reads `infantry.hpPerSoldier` from it. */
  readonly unitTuning: UnitTuning;
  /** Reward and infestation scale, shared with the M1 auto-resolver (#62). */
  readonly tuning: MissionRewardTuning;
  /** The finished mission for a mission id. */
  readonly finishedMission: FinishedMissionSource;
}

// ===========================================
// Mapping
// ===========================================

/**
 * Turns a played-out mission into the `MissionResult` the overworld
 * applies (GDD §6.5). Pure and total: it reads the finished tactical
 * state and the roster as it stood at launch, and rolls nothing.
 *
 * ```
 *   deployment.squadIds ──► squad unit (on the map or extracted)
 *        survivors = ⌈hp / hpPerSoldier⌉      losses = strength − survivors
 *        survivors 0 ──► squadsWiped
 *
 *   deployment.mechIds  ──► mech unit
 *        damage after = 100 × (1 − hp / maxHp)   added = after − mech.damage
 *        hp 0 ──► the rest of its 0..100 damage, mechsDestroyed
 *
 *   log UnitDied { killerId } ──► kills credited to the killer's squad or mech
 *   outcome ──► creditsFor / infestationDeltaFor, the auto-resolver's scale
 * ```
 *
 * A unit that extracted is read exactly as it walked off the map, so a
 * squad that pulled out at half strength still reports its casualties.
 * A deployed unit with no token in the mission (a mismatched deployment,
 * which mission start cannot produce) is reported as having taken no
 * losses rather than as wiped, so a bad pairing never empties the roster.
 * `squadsWiped` and `mechsDestroyed` stay summaries of the reports beside
 * them, the invariant `MissionResult` asks a resolver to uphold: an entry
 * appears only when the unit actually lost something this mission.
 *
 * @throws {Error} if the deployment names a squad or mech missing from
 *   `state`; `LaunchMission` (#67) validates the deployment first, so
 *   this is a programmer error.
 */
export function tacticalMissionResult(
  input: MissionResultInput,
  deps: MissionResultDeps,
): MissionResult {
  const { tactical, mission, deployment, state } = input;
  const outcome = tactical.outcome ?? missionOutcome(tactical) ?? "lost";
  const roster = [...tactical.units, ...tactical.extracted];
  const kills = killsBySource(tactical, roster);

  const squadCasualties: SquadCasualties[] = [];
  const squadsWiped: string[] = [];
  for (const squad of deployedSquads(deployment, state)) {
    const unit = findUnit(roster, "squad", squad.id);
    const credited = kills.get(squad.id) ?? 0;
    if (unit === undefined) {
      pushCasualties(squadCasualties, squad.id, 0, credited);
      continue;
    }
    const survivors = clamp(
      Math.ceil(unit.hp / deps.hpPerSoldier),
      0,
      squad.strength,
    );
    const losses = squad.strength - survivors;
    pushCasualties(squadCasualties, squad.id, losses, credited);
    if (losses > 0 && survivors === 0) {
      squadsWiped.push(squad.id);
    }
  }

  const mechDamage: MechDamageReport[] = [];
  const mechsDestroyed: string[] = [];
  for (const mech of deployedMechs(deployment, state)) {
    const unit = findUnit(roster, "mech", mech.id);
    const credited = kills.get(mech.id) ?? 0;
    const remaining = MECH_MAX_DAMAGE - mech.damage;
    const damage =
      unit === undefined
        ? 0
        : clamp(damageTaken(unit, mech.damage), 0, remaining);
    if (damage === 0 && credited === 0) {
      continue;
    }
    mechDamage.push({
      mechId: mech.id,
      damage,
      ...(credited > 0 ? { kills: credited } : {}),
    });
    if (damage > 0 && damage >= remaining) {
      mechsDestroyed.push(mech.id);
    }
  }

  return {
    missionId: mission.id,
    cityId: mission.cityId,
    outcome,
    squadCasualties,
    squadsWiped,
    mechsDestroyed,
    mechDamage,
    creditsAwarded: creditsFor(outcome, mission, deps.tuning),
    infestationDelta: infestationDeltaFor(outcome, mission, deps.tuning),
  };
}

// ===========================================
// TacticalMissionResolver
// ===========================================

/**
 * The M2 `MissionResolver` (GDD §6): the mission is played out on a
 * generated map rather than rolled, so the two halves of resolving one
 * are split across many commands.
 *
 * ```
 *   deployment screen ──► beginMission ──► state.activeMission
 *          │                                       │
 *          │              tactical commands (#324) │ many turns
 *          ▼                                       ▼
 *   MissionEnded ──► LaunchMission ──► resolve ──► finishMission ──► MissionResult
 * ```
 *
 * `resolve` satisfies the port #67's launch path calls, reading the
 * finished mission through the injected `finishedMission` source because
 * a resolver is handed only the overworld's slice of truth. It draws
 * nothing from `rng`: the mission's own commands already consumed every
 * roll, forked from the campaign seed, so a replayed mission resolves the
 * same way.
 */
export class TacticalMissionResolver implements MissionResolver {
  // ===========================================
  // Fields
  // ===========================================

  private readonly deps: TacticalResolveDeps;

  // ===========================================
  // Construction
  // ===========================================

  /** Resolves with the given mission-start deps, tuning and mission source. */
  constructor(deps: TacticalResolveDeps) {
    this.deps = deps;
  }

  // ===========================================
  // Mission lifecycle
  // ===========================================

  /**
   * Starts the mission: generates its map, places the deployment and
   * stores the `TacticalState` in `activeMission` (#323). Generic over
   * the campaign state so the app passes its `GameState` while this
   * domain never imports `save/`.
   */
  beginMission<TState extends MissionCampaignState>(
    state: TState,
    missionId: MissionId,
    deployment: Deployment,
    ids: IdGenerator,
  ): Result<TState, TacticalError> {
    return startTacticalMission(
      state,
      missionId,
      deployment,
      this.deps.missionStartDepsFor(ids),
    );
  }

  /** Turns a finished mission into its result. See `tacticalMissionResult`. */
  finishMission(input: MissionResultInput): MissionResult {
    return tacticalMissionResult(input, {
      hpPerSoldier: this.deps.unitTuning.infantry.hpPerSoldier,
      tuning: this.deps.tuning,
    });
  }

  // ===========================================
  // MissionResolver
  // ===========================================

  /**
   * Resolves the mission the tactical layer has just played. `rng` is
   * unused: the mission consumed its randomness turn by turn.
   *
   * @throws {Error} if no mission with that id has been played, which
   *   means the launch path resolved a mission `beginMission` never
   *   started.
   */
  resolve(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
    _rng: Rng,
  ): MissionResult {
    const tactical = this.deps.finishedMission(mission.id);
    if (tactical === undefined) {
      throw new Error(
        `Mission "${mission.id}" was never played; nothing to resolve`,
      );
    }
    return this.finishMission({ tactical, mission, deployment, state });
  }
}

// ===========================================
// Helpers
// ===========================================

/**
 * Kills credited to each deployed squad and mech, by roster source id:
 * every `UnitDied` in the mission log whose killer was one of ours and
 * whose casualty was a bug. Friendly fire earns nobody a kill.
 */
function killsBySource(
  tactical: TacticalState,
  roster: readonly Unit[],
): Map<string, number> {
  const sourceByUnit = new Map<UnitId, string>();
  for (const unit of roster) {
    if (unit.team === "tdf") {
      sourceByUnit.set(unit.id, unit.sourceId);
    }
  }
  const kills = new Map<string, number>();
  for (const event of tactical.log) {
    if (event.type !== UNIT_DIED) {
      continue;
    }
    const { unitId, killerId } = event.payload;
    if (killerId === undefined) {
      continue;
    }
    const source = sourceByUnit.get(killerId);
    const dead = roster.find((unit) => unit.id === unitId);
    if (source === undefined || dead?.team !== "bugs") {
      continue;
    }
    kills.set(source, (kills.get(source) ?? 0) + 1);
  }
  return kills;
}

/** The token a deployed roster entry fought as, wherever it ended up. */
function findUnit(
  roster: readonly Unit[],
  kind: UnitKind,
  sourceId: string,
): Unit | undefined {
  return roster.find(
    (unit) => unit.kind === kind && unit.sourceId === sourceId,
  );
}

/**
 * Damage this mission added to a mech, on the roster's `0..100` scale:
 * its hit points read back as a damage percentage, less the damage it
 * arrived with. A wreck (`hp` 0) reads as the full remainder.
 */
function damageTaken(unit: Unit, damageAtLaunch: number): number {
  if (unit.hp <= 0 || unit.maxHp <= 0) {
    return MECH_MAX_DAMAGE - damageAtLaunch;
  }
  const after = Math.round(MECH_MAX_DAMAGE * (1 - unit.hp / unit.maxHp));
  return after - damageAtLaunch;
}

/** Records a squad's report when it has something to report. */
function pushCasualties(
  reports: SquadCasualties[],
  squadId: string,
  losses: number,
  kills: number,
): void {
  if (losses === 0 && kills === 0) {
    return;
  }
  reports.push({ squadId, losses, ...(kills > 0 ? { kills } : {}) });
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
