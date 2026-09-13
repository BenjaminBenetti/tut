import type { BugBehaviour } from "../../bugs/ai/bug-behaviour";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";
import { createBugPhaseRunner } from "../../bugs/ai/bug-phase-runner";
import { BruteBehaviour } from "../../bugs/ai/brute-behaviour";
import { LurkerBehaviour } from "../../bugs/ai/lurker-behaviour";
import { SwarmerBehaviour } from "../../bugs/ai/swarmer-behaviour";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { BUG_SPECIES } from "../../bugs/data/species";
import type { IdGenerator } from "../../core/model/id-generator";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { Mech } from "../../roster/model/mech";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { DEMOLITION_TUNING } from "../../tactical/data/demolition-tuning";
import { HAZARD_TUNING } from "../../tactical/data/hazard-tuning";
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { ABANDON_MISSION } from "../../tactical/model/abandon-mission-command";
import { EXTRACT } from "../../tactical/model/extract-command";
import { INTERACT } from "../../tactical/model/interact-command";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { RELOAD } from "../../tactical/model/reload-command";
import type { AttackDeps } from "../../tactical/service/combat-service";
import { DEPLOY_RADAR } from "../../tactical/model/deploy-radar-command";
import { RADAR_TUNING } from "../../tactical/data/radar-tuning";
import {
  createDeployRadarHandler,
  drainRadarBatteries,
} from "../../tactical/service/radar-service";
import { createAttackHandler } from "../../tactical/service/combat-service";
import type { MissionStartDeps } from "../../tactical/service/mission-start-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  createExtractHandler,
  createInteractHandler,
} from "../../tactical/service/objective-service";
import { createAbandonMissionHandler } from "../../tactical/service/abandon-mission-handler";
import { overwatchHandler } from "../../tactical/service/overwatch-handler";
import { reloadHandler } from "../../tactical/service/reload-handler";
import type { SpawnDeps } from "../../tactical/service/spawn-service";
import {
  createEdgeWaveStep,
  createHatchStep,
} from "../../tactical/service/spawn-service";
import { registryStructureCatalogue } from "../../tactical/service/structure-catalogue";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import { createBurnStep } from "../../tactical/service/tile-effect-service";
import type { FinishedMissionSource } from "../../tactical/service/tactical-mission-resolver";
import { TacticalMissionResolver } from "../../tactical/service/tactical-mission-resolver";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "../../tactical/service/turn-service";
import type { MapGenRegistries } from "../../mapgen/model/registries";
import type { GameContent } from "./game-composition";

// ===========================================
// Types
// ===========================================

/** The content the tactical side reads: a subset of `GameContent`. */
export type TacticalContent = Pick<
  GameContent,
  "squadTypes" | "parts" | "rating" | "upgrades" | "missionTypes"
>;

/** What the tactical side of the app exposes to screens and dev hooks. */
export interface TacticalComposition {
  /** The pure rule handlers registered on the campaign dispatcher, by command tag. */
  readonly handlers: TacticalHandlers;
  /**
   * What a shot needs beyond the combat tuning (#1121), over the shipped
   * content. The HUD previews blasts and demolition against the same
   * ports the rules resolve them with.
   */
  readonly attackDeps: AttackDeps;
  /** Deps for `startTacticalMission` over the given id generator. */
  readonly missionStartDepsFor: (ids: IdGenerator) => MissionStartDeps;
  /**
   * The M2 `MissionResolver` (#330) over a source of the finished
   * mission, for `LaunchMission` to resolve a played mission with (#341
   * hands it the store's `activeMission`).
   */
  readonly resolverFor: (
    finishedMission: FinishedMissionSource,
  ) => TacticalMissionResolver;
}

// ===========================================
// Composition
// ===========================================

/**
 * Wires the tactical domain into the campaign (#342, per the #324
 * ruling): tactical commands join the campaign dispatcher, lifted over
 * `activeMission`, so there is one store, one autosave and one event
 * stream. `handlers` defaults to `shippedTacticalHandlers`, the rules
 * that have landed; a command without a handler dispatches as
 * `unknown-command` until its issue merges. `missionStartDepsFor` gives
 * `LaunchMission` (#341) and the dev hook what `startTacticalMission`
 * needs from the shipped content, and `resolverFor` builds the M2
 * resolver (#330) over whatever the caller can find the finished mission
 * in.
 *
 * ```
 *   composeGame ──► composeTactical(content, handlers)
 *                     ├── registerTacticalCommands(dispatcher, handlers)
 *                     ├── missionStartDepsFor(ids) ──► startTacticalMission(...)
 *                     └── resolverFor(() => store.getState().activeMission)
 * ```
 */
export function composeTactical(
  dispatcher: CommandDispatcher<GameState>,
  content: TacticalContent,
  handlers?: TacticalHandlers,
): TacticalComposition {
  const registries = createDefaultRegistries();
  handlers ??= shippedTacticalHandlers(registries);
  registerTacticalCommands(dispatcher, handlers);
  const sheetFor = createSheetLookup(
    content.parts,
    content.rating,
    content.upgrades,
  );
  const missionStartDepsFor = (ids: IdGenerator): MissionStartDeps => ({
    missionTypes: content.missionTypes,
    squadTypes: content.squadTypes,
    sheetFor,
    unitTuning: UNIT_TUNING,
    spawnTuning: SPAWN_TUNING,
    ids,
    registries,
  });
  return {
    handlers,
    attackDeps: attackDepsOver(registries),
    missionStartDepsFor,
    resolverFor: (finishedMission) =>
      new TacticalMissionResolver({
        missionStartDepsFor,
        unitTuning: UNIT_TUNING,
        tuning: AUTO_RESOLVE_TUNING,
        finishedMission,
      }),
  };
}

// ===========================================
// Helpers
// ===========================================

/**
 * The rule handlers that have landed, one line per rules issue: this is
 * the single registration site for tactical commands (#342). The action
 * rules are built first so the bug phase (#335) can drive them without
 * being able to recurse into `EndTurn`; `EndTurn` then closes over the
 * spawn steps (#329) and that runner, so one end of turn hatches, waves,
 * plays the bugs and hands the next turn back to the player. Tests pass
 * their own object to isolate the lifting path.
 *
 * ```
 *   EndTurn ──► phase steps: refreshSides, drain radars, burn, hatch, edge waves
 *                    └──► bug phase runner ──► every living bug acts
 *                              └──► player turn + 1 (or MissionEnded)
 * ```
 *
 * Fires burn right after the sides are refreshed (#1121): the side
 * whose phase begins pays for standing in one before it can move out,
 * and before anything hatches into it. Radar batteries drain as the
 * player's turn opens (#1130), before the fires, so a scanner that dies
 * this turn is announced at the top of the turn's account.
 */
export function shippedTacticalHandlers(
  registries: MapGenRegistries = createDefaultRegistries(),
): TacticalHandlers {
  const spawn: SpawnDeps = {
    species: Object.values(BUG_SPECIES),
    tuning: SPAWN_TUNING,
  };
  const attackDeps = attackDepsOver(registries);
  const actions: TacticalHandlers = {
    [ATTACK]: createAttackHandler(COMBAT_TUNING, attackDeps),
    [MOVE]: createMoveHandler(
      createOverwatchReaction(COMBAT_TUNING, attackDeps),
    ),
    [OVERWATCH]: overwatchHandler,
    [RELOAD]: reloadHandler,
    [DEPLOY_RADAR]: createDeployRadarHandler(RADAR_TUNING),
    [INTERACT]: createInteractHandler(OBJECTIVE_TUNING),
    [EXTRACT]: createExtractHandler(OBJECTIVE_TUNING),
    [ABANDON_MISSION]: createAbandonMissionHandler(),
  };
  const bugPhase = createBugPhaseRunner({
    handlers: actions,
    registry: new MapBehaviourRegistry(shippedBugBehaviours()),
    speciesOf: createSpeciesLookup(BUG_SPECIES),
    combat: COMBAT_TUNING,
  });
  return {
    ...actions,
    [END_TURN]: createEndTurnHandler(
      [
        ...DEFAULT_PHASE_STEPS,
        drainRadarBatteries,
        createBurnStep(HAZARD_TUNING, COMBAT_TUNING),
        createHatchStep(spawn),
        createEdgeWaveStep(spawn),
      ],
      bugPhase,
    ),
  };
}

/** The shot's content ports over the mapgen registries, with the shipped tunings (#1121). */
export function attackDepsOver(registries: MapGenRegistries): AttackDeps {
  return {
    structures: registryStructureCatalogue(registries),
    demolition: DEMOLITION_TUNING,
    hazards: HAZARD_TUNING,
  };
}

/**
 * The bug behaviours that have landed, one line per species issue: the
 * lurker's `flank` (#333), the swarmer's `rush` (#332) and the brute's
 * `punish-clumps` (#334). Every species the catalogue defines now has
 * one, so nothing on the map holds still for want of a behaviour.
 *
 * Registering a behaviour is what makes the species act, so a merge that
 * lands a behaviour class without adding it here is a bug that no test
 * of that class can catch. `species.test.ts` covers the other direction.
 */
export function shippedBugBehaviours(): readonly BugBehaviour[] {
  return [new LurkerBehaviour(), new SwarmerBehaviour(), new BruteBehaviour()];
}

/** A mech's current stat sheet from its loadout, or undefined when it no longer validates. */
export function createSheetLookup(
  parts: PartCatalogue,
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): (mech: Mech) => MechStatSheet | undefined {
  return (mech) => {
    const sheet = validateLoadout(mech.loadout, parts, rating, upgrades);
    return sheet.ok ? sheet.value : undefined;
  };
}
