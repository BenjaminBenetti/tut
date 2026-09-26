import {
  CONFIGURE_JEV,
  SET_JEV_COMMANDER_PROMPT,
  JEV_ACT,
  DEFAULT_BUG_ACT,
} from "../../tactical/model/jev-command";
import {
  configureJevHandler,
  setJevCommanderPromptHandler,
  createJevActHandler,
  createDefaultBugActHandler,
} from "../../tactical/service/jev-control-service";
import { chooseBugCommands } from "../../bugs/ai/behaviour-registry";
import { viewFor } from "../../tactical/service/mission-view-service";
import { MECH_ACTION } from "../../tactical/model/mech-action-command";
import { createMechActionHandler } from "../../tactical/service/mech-action-service";
import type { BugBehaviour } from "../../bugs/ai/bug-behaviour";
import { MapBehaviourRegistry } from "../../bugs/ai/behaviour-registry";
import { createBugPhaseRunner } from "../../bugs/ai/bug-phase-runner";
import { BruteBehaviour } from "../../bugs/ai/brute-behaviour";
import { HiveGuardBehaviour } from "../../bugs/ai/hive-guard-behaviour";
import { LurkerBehaviour } from "../../bugs/ai/lurker-behaviour";
import { SpitterBehaviour } from "../../bugs/ai/spitter-behaviour";
import { SwarmerBehaviour } from "../../bugs/ai/swarmer-behaviour";
import { createSpeciesLookup } from "../../bugs/service/species-lookup";
import { BUG_SPECIES } from "../../bugs/data/species";
import { createPersonaLookup } from "../../bugs/service/persona-lookup";
import { PERSONAS } from "../../bugs/data/personas";
import type { IdGenerator } from "../../core/model/id-generator";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { Mech } from "../../roster/model/mech";
import type { MechLoadout } from "../../roster/model/mech-loadout";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
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
import { HARVEST_CARCASS } from "../../tactical/model/harvest-carcass-command";
import { INTERACT } from "../../tactical/model/interact-command";
import { MOVE } from "../../tactical/model/move-command";
import { OVERWATCH } from "../../tactical/model/overwatch-command";
import { PLACE_UNIT } from "../../tactical/model/place-unit-command";
import type { PlaceableUnit } from "../../tactical/model/place-unit-command";
import { RELOAD } from "../../tactical/model/reload-command";
import type { AttackDeps } from "../../tactical/service/combat-service";
import { RADAR_TUNING } from "../../tactical/data/radar-tuning";
import { GARRISON_TUNING } from "../../tactical/data/garrison-tuning";
import { GENERATOR_TUNING } from "../../tactical/data/generator-tuning";
import { TURRET_TUNING } from "../../tactical/data/turret-tuning";
import { createTurretStep } from "../../tactical/service/turret-service";
import { USE_EQUIPMENT } from "../../tactical/model/use-equipment-command";
import { SHIPPED_EQUIPMENT } from "../../tactical/repository/equipment-catalogue";
import type { EquipmentDeps } from "../../tactical/service/equipment-service";
import {
  createDetonateStep,
  createUseEquipmentHandler,
} from "../../tactical/service/equipment-service";
import { drainRadarBatteries } from "../../tactical/service/radar-service";
import { createAttackHandler } from "../../tactical/service/combat-service";
import type { MissionStartDeps } from "../../tactical/service/mission-start-service";
import { createMoveHandler } from "../../tactical/service/move-handler";
import {
  createExtractHandler,
  createInteractHandler,
} from "../../tactical/service/objective-service";
import { MISSION_SETUP_RULES } from "../../tactical/service/missions/mission-setup-rules";
import { createObjectiveDeadlineStep } from "../../tactical/service/objectives/objective-deadline-step";
import { objectivePhaseSteps } from "../../tactical/service/objectives/objective-rules";
import { createAbandonMissionHandler } from "../../tactical/service/abandon-mission-handler";
import { createHarvestHandler } from "../../tactical/service/harvest-service";
import type {
  DebugMechSource,
  PlaceUnitDeps,
} from "../../tactical/service/place-unit-handler";
import {
  createPlaceUnitHandler,
  placeableUnits,
} from "../../tactical/service/place-unit-handler";
import { overwatchHandler } from "../../tactical/service/overwatch-handler";
import { reloadHandler } from "../../tactical/service/reload-handler";
import type { SpawnDeps } from "../../tactical/service/spawn-service";
import {
  createEdgeWaveStep,
  createHatchStep,
  createPodBurstStep,
} from "../../tactical/service/spawn-service";
import { registryStructureCatalogue } from "../../tactical/service/structure-catalogue";
import type { TacticalHandlers } from "../../tactical/service/tactical-command-handlers";
import { registerTacticalCommands } from "../../tactical/service/tactical-command-handlers";
import {
  createBurnStep,
  createHazardReaction,
} from "../../tactical/service/tile-effect-service";
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

/**
 * The development tools a dev build offers the tactical screen (#1136).
 * Present only when the composition was told this is a dev build; a
 * production build gets `undefined` and renders nothing of them.
 */
export interface DevTools {
  /** Every unit the debug menu can place, from the handler's own catalogues. */
  readonly placeable: readonly PlaceableUnit[];
}

/** Session switches the tactical composition takes beside the content. */
export interface TacticalCompositionOptions {
  /**
   * Whether this is a dev build (`import.meta.env.DEV` at the bootstrap,
   * #1136). Enables the `PlaceUnit` handler and the debug menu's
   * catalogue; false — the default — registers the handler refusing.
   */
  readonly devTools?: boolean;
}

/** What the tactical side of the app exposes to screens and dev hooks. */
export interface TacticalComposition {
  /** The pure rule handlers registered on the campaign dispatcher, by command tag. */
  readonly handlers: TacticalHandlers;
  /** The development tools, in a dev build; otherwise undefined (#1136). */
  readonly devTools: DevTools | undefined;
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
  options: TacticalCompositionOptions = {},
): TacticalComposition {
  const registries = createDefaultRegistries();
  const sheetForLoadout = createLoadoutSheetLookup(
    content.parts,
    content.rating,
    content.upgrades,
  );
  const sheetFor = (mech: Mech): MechStatSheet | undefined =>
    sheetForLoadout(mech.loadout);
  // The placement handler is registered whether or not this is a dev
  // build (#1136): outside one it refuses with `debug-disabled`, which
  // is a typed answer where an unregistered command would be
  // `unknown-command` — and it means a production save that somehow
  // carries a `PlaceUnit` replays to a refusal, not to a unit.
  const placement: PlaceUnitDeps = {
    enabled: options.devTools === true,
    species: Object.values(BUG_SPECIES),
    squadTypes: content.squadTypes,
    mechs: DEBUG_MECHS,
    sheetFor: sheetForLoadout,
    unitTuning: UNIT_TUNING,
  };
  handlers ??= shippedTacticalHandlers(registries, placement);
  registerTacticalCommands(dispatcher, handlers);
  const missionStartDepsFor = (ids: IdGenerator): MissionStartDeps => ({
    missionTypes: content.missionTypes,
    squadTypes: content.squadTypes,
    sheetFor,
    unitTuning: UNIT_TUNING,
    spawnTuning: SPAWN_TUNING,
    ids,
    registries,
    garrison: GARRISON_TUNING,
    generator: GENERATOR_TUNING,
    setupRules: MISSION_SETUP_RULES,
  });
  return {
    handlers,
    devTools: placement.enabled
      ? { placeable: placeableUnits(placement) }
      : undefined,
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
 * The mechs the debug menu can field (#1136): the starter loadout, the
 * one every campaign begins with. A loadout rather than a roster mech,
 * because the tools place a fresh machine, not the player's.
 */
const DEBUG_MECHS: readonly DebugMechSource[] = [
  { id: "starter", name: "Mech (starter)", loadout: STARTER_LOADOUT },
];

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
 *   EndTurn ──► phase steps: refreshSides, objective deadlines, drain radars, run turrets,
 *                            detonate charges, burn, hatch, edge waves, objective kinds' steps
 *                    └──► bug phase runner ──► every living bug acts
 *                              └──► player turn + 1 (or MissionEnded)
 * ```
 *
 * Fires burn right after the sides are refreshed (#1121): the side
 * whose phase begins pays for standing in one before it can move out,
 * and before anything hatches into it. Radar batteries drain as the
 * player's turn opens (#1130), before the fires, so a scanner that dies
 * this turn is announced at the top of the turn's account. Turrets run
 * beside them (#1138): their batteries drain and the survivors go back
 * on overwatch, after `refreshSides` has let last turn's watch lapse.
 * Breaching charges go off next (#1132), before the fires: whatever the
 * blast lights burns from this turn, and a bug the blast leaves
 * standing in a fire pays for it before it can move.
 *
 * Objective deadlines are judged ahead of all of that (ADR 0013 §2.3),
 * right after `refreshSides`, so nothing the new turn opens with can
 * beat the clock; the objective kinds' own steps (`OBJECTIVE_RULES`, a
 * defence's first) run last, after the wave they judge has landed.
 *
 * `placement` is the development tools' unit placement (#1136); left
 * out, as the headless sim leaves it, the handler is registered refusing
 * so the command has one answer everywhere.
 */
export function shippedTacticalHandlers(
  registries: MapGenRegistries = createDefaultRegistries(),
  placement: PlaceUnitDeps = DISABLED_PLACEMENT,
): TacticalHandlers {
  const spawn: SpawnDeps = {
    species: Object.values(BUG_SPECIES),
    tuning: SPAWN_TUNING,
  };
  const attackDeps = attackDepsOver(registries);
  const equipment: EquipmentDeps = {
    catalogue: SHIPPED_EQUIPMENT,
    combat: COMBAT_TUNING,
    attack: attackDeps,
    radar: RADAR_TUNING,
    turret: TURRET_TUNING,
  };
  const movementReaction = createHazardReaction(
    HAZARD_TUNING,
    COMBAT_TUNING,
    createOverwatchReaction(COMBAT_TUNING, attackDeps),
  );
  const actions: TacticalHandlers = {
    [MECH_ACTION]: createMechActionHandler(movementReaction),
    [ATTACK]: createAttackHandler(COMBAT_TUNING, attackDeps),
    [MOVE]: createMoveHandler(movementReaction),
    [OVERWATCH]: overwatchHandler,
    [RELOAD]: reloadHandler,
    [USE_EQUIPMENT]: createUseEquipmentHandler(equipment),
    [INTERACT]: createInteractHandler(OBJECTIVE_TUNING),
    [HARVEST_CARCASS]: createHarvestHandler(OBJECTIVE_TUNING),
    [EXTRACT]: createExtractHandler(OBJECTIVE_TUNING),
    [ABANDON_MISSION]: createAbandonMissionHandler(),
    [PLACE_UNIT]: createPlaceUnitHandler(placement),
  };
  const registry = new MapBehaviourRegistry(shippedBugBehaviours());
  const speciesOf = createSpeciesLookup(BUG_SPECIES);
  // A named enemy plays its persona's fallback without Jev, in the
  // synchronous bug phase and in a mixed Jev phase alike (ADR 0013 §2.8).
  const personaOf = createPersonaLookup(PERSONAS);
  const bugPhase = createBugPhaseRunner({
    handlers: actions,
    registry,
    speciesOf,
    personaOf,
    combat: COMBAT_TUNING,
  });
  return {
    ...actions,
    [CONFIGURE_JEV]: configureJevHandler,
    [SET_JEV_COMMANDER_PROMPT]: setJevCommanderPromptHandler,
    [JEV_ACT]: createJevActHandler(actions),
    [DEFAULT_BUG_ACT]: createDefaultBugActHandler(
      actions,
      (mission, unitId, ctx) =>
        chooseBugCommands(
          viewFor(mission, "bugs"),
          unitId,
          registry,
          speciesOf,
          { rng: ctx.rng, combat: COMBAT_TUNING },
          personaOf,
        ),
    ),
    [END_TURN]: createEndTurnHandler(
      [
        ...DEFAULT_PHASE_STEPS,
        // First, so a deadline judges the mission as its last turn left
        // it: nothing the new turn opens with can beat the clock.
        createObjectiveDeadlineStep(),
        // A pod the deadline just matured bursts in the same phase start,
        // before anything else moves (campaign arc §6.3).
        createPodBurstStep(spawn),
        drainRadarBatteries,
        createTurretStep(TURRET_TUNING),
        createDetonateStep(equipment),
        createBurnStep(HAZARD_TUNING, COMBAT_TUNING),
        createHatchStep(spawn),
        createEdgeWaveStep(spawn),
        // Each objective kind's own step, after the wave lands, so the
        // count it just made is the one a defence is judged on (#1175).
        ...objectivePhaseSteps(),
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
 * lurker's `flank` (#333), the swarmer's `rush` (#332), the brute's
 * `punish-clumps` (#334), the spitter's `snipe` (#1179) and the Hive
 * Guard's `guard` (#1179). Every species the catalogue defines has one,
 * so nothing on the map holds still for want of a behaviour.
 *
 * Registering a behaviour is what makes the species act, so a merge that
 * lands a behaviour class without adding it here is a bug that no test
 * of that class can catch. `species.test.ts` covers the other direction.
 */
export function shippedBugBehaviours(): readonly BugBehaviour[] {
  return [
    new LurkerBehaviour(),
    new SwarmerBehaviour(),
    new BruteBehaviour(),
    new SpitterBehaviour(),
    new HiveGuardBehaviour(),
  ];
}

/** A mech's current stat sheet from its loadout, or undefined when it no longer validates. */
export function createSheetLookup(
  parts: PartCatalogue,
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): (mech: Mech) => MechStatSheet | undefined {
  const sheetFor = createLoadoutSheetLookup(parts, rating, upgrades);
  return (mech) => sheetFor(mech.loadout);
}

/**
 * A loadout's stat sheet, or undefined when it does not validate. The
 * lookup `createSheetLookup` is built on; on its own for the placement
 * handler (#1136), which has a loadout and no roster mech to wrap it in.
 */
export function createLoadoutSheetLookup(
  parts: PartCatalogue,
  rating: MechRatingTuning,
  upgrades: UpgradeTuning,
): (loadout: MechLoadout) => MechStatSheet | undefined {
  return (loadout) => {
    const sheet = validateLoadout(loadout, parts, rating, upgrades);
    return sheet.ok ? sheet.value : undefined;
  };
}

/**
 * Placement with nothing to place and the switch off: what the shipped
 * handlers register when nobody supplies the dev deps, so `PlaceUnit`
 * answers `debug-disabled` from the headless sim and the tests alike.
 */
const DISABLED_PLACEMENT: PlaceUnitDeps = {
  enabled: false,
  species: [],
  squadTypes: { getSquadType: () => undefined, listSquadTypes: () => [] },
  mechs: [],
  sheetFor: () => undefined,
  unitTuning: UNIT_TUNING,
};
