import type { BugSpeciesId } from "../../content/model/bug-species-id";
import { BUG_SPECIES_IDS } from "../../content/model/bug-species-id";
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
  MissionResultDefence,
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
  techPointsFor,
} from "../../overworld/service/mission-reward-service";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { TacticalError } from "../model/tactical-error";
import type {
  DefendGeneratorsObjective,
  TacticalState,
} from "../model/tactical-state";
import { defendStatus } from "./defence-service";
import { CARCASS_HARVESTED } from "../model/carcass-harvested-event";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import { UNIT_DIED } from "../model/unit-died-event";
import type { Unit, UnitId, UnitKind } from "../model/unit";
import type { UnitTuning } from "../model/unit-tuning";
import type { MissionStartOptions } from "../model/mission-start-options";
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
 *   log UnitDied { killerId } ──► kills credited to the killer's squad or mech,
 *                                 each worth its template's xpValue (#1130)
 *   outcome ──► creditsFor / infestationDeltaFor, the auto-resolver's scale
 *   log CarcassHarvested { techPoints } ──► summed into techPointsFor as
 *                                 harvested; techPointsHarvested says so (#1171)
 *   log UnitDied of a bug ──► its species, once each, into speciesKilled
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
  const credits = creditsBySource(tactical, roster);

  const squadCasualties: SquadCasualties[] = [];
  const squadsWiped: string[] = [];
  for (const squad of deployedSquads(deployment, state)) {
    const unit = findUnit(roster, "squad", squad.id);
    const credited = credits.get(squad.id) ?? NO_CREDIT;
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
    const credited = credits.get(mech.id) ?? NO_CREDIT;
    const remaining = MECH_MAX_DAMAGE - mech.damage;
    const damage =
      unit === undefined
        ? 0
        : clamp(damageTaken(unit, mech.damage), 0, remaining);
    if (damage === 0 && credited.kills === 0) {
      continue;
    }
    mechDamage.push({
      mechId: mech.id,
      damage,
      ...creditFields(credited),
    });
    if (damage > 0 && damage >= remaining) {
      mechsDestroyed.push(mech.id);
    }
  }

  const harvested = techPointsHarvested(tactical);
  return {
    missionId: mission.id,
    cityId: mission.cityId,
    outcome,
    squadCasualties,
    squadsWiped,
    mechsDestroyed,
    mechDamage,
    creditsAwarded: creditsFor(outcome, mission, deps.tuning),
    techPointsAwarded: techPointsFor(outcome, mission, deps.tuning, harvested),
    infestationDelta: infestationDeltaFor(outcome, mission, deps.tuning),
    ...leftBehindField(tactical, roster),
    ...(harvested > 0 ? { techPointsHarvested: harvested } : {}),
    ...defenceField(tactical),
    ...speciesKilledField(tactical, roster),
  };
}

/**
 * How a defence ended (#1175): the installation and whether any of its
 * generators was still running when the mission closed. Absent for
 * every other mission so their results are exactly what they were.
 */
function defenceField(tactical: TacticalState): {
  defence?: MissionResultDefence;
} {
  const objective = tactical.objectives.find(
    (candidate): candidate is DefendGeneratorsObjective =>
      candidate.kind === "defend-generators",
  );
  if (objective === undefined) {
    return {};
  }
  return {
    defence: {
      installation: objective.installation,
      held: defendStatus(tactical, objective) !== "failed",
    },
  };
}

/**
 * Whole tech points the squads stripped from carcasses this mission
 * (#1171), summed off the log's `CarcassHarvested` events. Read from the
 * log rather than the carcass records so a mission whose carcass was
 * harvested and then lost still tallies what was stripped, and
 * `techPointsFor` alone decides whether the outcome keeps it.
 */
function techPointsHarvested(tactical: TacticalState): number {
  let harvested = 0;
  for (const event of tactical.log) {
    if (event.type === CARCASS_HARVESTED) {
      harvested += Math.max(0, event.payload.techPoints);
    }
  }
  return harvested;
}

/**
 * Every bug species that lost a unit this mission (ADR 0013 §2.1), for
 * the campaign's first-kill record: each `UnitDied` in the log whose
 * casualty was a bug, read as its `sourceId` (a bug's species id), each
 * species once in first-death order. A death with or without a killer
 * counts; a `sourceId` outside `BUG_SPECIES_IDS` is not a species and is
 * skipped. Absent when no bug died, so such a result is exactly what it
 * was before the field existed.
 */
function speciesKilledField(
  tactical: TacticalState,
  roster: readonly Unit[],
): { speciesKilled?: readonly BugSpeciesId[] } {
  const killed: BugSpeciesId[] = [];
  for (const event of tactical.log) {
    if (event.type !== UNIT_DIED) {
      continue;
    }
    const dead = roster.find((unit) => unit.id === event.payload.unitId);
    const species = dead?.sourceId as BugSpeciesId | undefined;
    if (
      dead?.team === "bugs" &&
      species !== undefined &&
      BUG_SPECIES_IDS.includes(species) &&
      !killed.includes(species)
    ) {
      killed.push(species);
    }
  }
  return killed.length === 0 ? {} : { speciesKilled: killed };
}

/**
 * The roster entries the player left on the map (#1132), read off the
 * log's `UnitAbandoned` events in order; absent when there were none so
 * a mission nobody left is reported exactly as before.
 */
function leftBehindField(
  tactical: TacticalState,
  roster: readonly Unit[],
): { leftBehind?: readonly string[] } {
  const leftBehind: string[] = [];
  for (const event of tactical.log) {
    if (event.type !== UNIT_ABANDONED) {
      continue;
    }
    const unit = roster.find((u) => u.id === event.payload.unitId);
    if (unit !== undefined && !leftBehind.includes(unit.sourceId)) {
      leftBehind.push(unit.sourceId);
    }
  }
  return leftBehind.length === 0 ? {} : { leftBehind };
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
    options: MissionStartOptions = {},
  ): Result<TState, TacticalError> {
    return startTacticalMission(
      state,
      missionId,
      deployment,
      this.deps.missionStartDepsFor(ids),
      options,
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

/** What one squad or mech earned: its kills and what they were worth. */
interface KillCredit {
  readonly kills: number;
  readonly xp: number;
}

/** Nothing earned: the credit of a unit that killed nothing. */
const NO_CREDIT: KillCredit = { kills: 0, xp: 0 };

/**
 * Kills credited to each deployed squad and mech, by roster source id,
 * with the experience they were worth (#1130): every `UnitDied` in the
 * mission log whose killer was one of ours and whose casualty was a
 * bug, each kill worth the dead unit's template `xpValue`. Friendly
 * fire earns nobody a kill, and a template with no worth — a mission
 * saved before species carried one — earns the kill and nothing else.
 */
function creditsBySource(
  tactical: TacticalState,
  roster: readonly Unit[],
): Map<string, KillCredit> {
  const sourceByUnit = new Map<UnitId, string>();
  for (const unit of roster) {
    if (unit.team === "tdf") {
      sourceByUnit.set(unit.id, unit.sourceId);
    }
  }
  const credits = new Map<string, KillCredit>();
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
    const worth = tactical.templates[dead.templateId]?.xpValue ?? 0;
    const soFar = credits.get(source) ?? NO_CREDIT;
    credits.set(source, {
      kills: soFar.kills + 1,
      xp: soFar.xp + Math.max(0, worth),
    });
  }
  return credits;
}

/** The optional `kills` and `xp` fields of a report, present only when earned. */
function creditFields(credit: KillCredit): { kills?: number; xp?: number } {
  return {
    ...(credit.kills > 0 ? { kills: credit.kills } : {}),
    ...(credit.xp > 0 ? { xp: credit.xp } : {}),
  };
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
  credit: KillCredit,
): void {
  if (losses === 0 && credit.kills === 0) {
    return;
  }
  reports.push({ squadId, losses, ...creditFields(credit) });
}

/** Clamps `value` into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
