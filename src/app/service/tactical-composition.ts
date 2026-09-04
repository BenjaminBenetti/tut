import type { BugBehaviour } from "../../bugs/ai/bug-behaviour";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";
import { createBugPhaseRunner } from "../../bugs/ai/bug-phase-runner";
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
import { OBJECTIVE_TUNING } from "../../tactical/data/objective-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { SPAWN_TUNING } from "../../tactical/data/spawn-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { END_TURN } from "../../tactical/model/end-turn-command";
import { EXTRACT } from "../../tactical/model/extract-command";
import { INTERACT } from "../../tactical/model/interact-command";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { RELOAD } from "../../tactical/model/reload-command";
import { createAttackHandler } from "../../tactical/service/combat-service";
import type { MissionStartDeps } from "../../tactical/service/mission-start-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  createExtractHandler,
  createInteractHandler,
} from "../../tactical/service/objective-service";
import { overwatchHandler } from "../../tactical/service/overwatch-handler";
import { reloadHandler } from "../../tactical/service/reload-handler";
import type { SpawnDeps } from "../../tactical/service/spawn-service";
import {
  createEdgeWaveStep,
  createHatchStep,
} from "../../tactical/service/spawn-service";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import type { FinishedMissionSource } from "../../tactical/service/tactical-mission-resolver";
import { TacticalMissionResolver } from "../../tactical/service/tactical-mission-resolver";
import {
  createEndTurnHandler,
  createOverwatchReaction,
  DEFAULT_PHASE_STEPS,
} from "../../tactical/service/turn-service";
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
  handlers: TacticalHandlers = shippedTacticalHandlers(),
): TacticalComposition {
  registerTacticalCommands(dispatcher, handlers);
  const registries = createDefaultRegistries();
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
 *   EndTurn ──► phase steps: refreshSides, hatch, edge waves
 *                    └──► bug phase runner ──► every living bug acts
 *                              └──► player turn + 1 (or MissionEnded)
 * ```
 */
export function shippedTacticalHandlers(): TacticalHandlers {
  const spawn: SpawnDeps = {
    species: Object.values(BUG_SPECIES),
    tuning: SPAWN_TUNING,
  };
  const actions: TacticalHandlers = {
    [ATTACK]: createAttackHandler(COMBAT_TUNING),
    [MOVE]: createMoveHandler(createOverwatchReaction(COMBAT_TUNING)),
    [OVERWATCH]: overwatchHandler,
    [RELOAD]: reloadHandler,
    [INTERACT]: createInteractHandler(OBJECTIVE_TUNING),
    [EXTRACT]: createExtractHandler(OBJECTIVE_TUNING),
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
        createHatchStep(spawn),
        createEdgeWaveStep(spawn),
      ],
      bugPhase,
    ),
  };
}

/**
 * The bug behaviours that have landed, one line per species issue: the
 * lurker's `flank` (#333) and the swarmer's `rush` (#332). A species
 * whose behaviour has not merged — the brute's `punish-clumps` (#334) —
 * holds still during the bug phase until it does.
 *
 * Registering a behaviour is what makes the species act, so a merge that
 * lands a behaviour class without adding it here is a bug that no test
 * of that class can catch. `species.test.ts` covers the other direction.
 */
export function shippedBugBehaviours(): readonly BugBehaviour[] {
  return [new LurkerBehaviour(), new SwarmerBehaviour()];
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
