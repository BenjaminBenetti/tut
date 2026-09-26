import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { TechPointTreasury } from "../../economy/service/tech-point-service";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EVENT_TUNING } from "../../overworld/data/event-tuning";
import { EVENT_TYPES } from "../../overworld/data/event-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { INFESTATION_TUNING } from "../../overworld/data/infestation-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CampaignDebugOptions } from "../../overworld/model/campaign-debug";
import { applyDebugThreat } from "../../overworld/service/campaign-debug-service";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { DeploymentAssessor } from "../../overworld/model/deployment-assessment";
import type { EventTypeCatalogue } from "../../overworld/model/event-type-catalogue";
import type { HiveTuning } from "../../overworld/model/hive-tuning";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { EVENT_TYPE_IDS } from "../../overworld/model/event-type";
import { ADVANCE_DAY } from "../../overworld/model/overworld-command";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../../overworld/repository/event-type-catalogue";
import { createAdvanceDayHandler } from "../../overworld/service/advance-day-service";
import { AutoResolveMissionResolver } from "../../overworld/service/auto-resolve-mission-resolver";
import { createDeploymentAssessor } from "../../overworld/service/deployment-assessment-service";
import { createLaunchMissionHandler } from "../../overworld/service/launch-mission-service";
import { LAUNCH_MISSION } from "../../overworld/model/launch-mission-command";
import type { MissionResolver } from "../../overworld/model/mission-resolver";
import { registerFinishMission } from "../../tactical/service/finish-mission-handler";
import { createGarrisonStartOptions } from "../../tactical/service/garrison-start-options";
import { registerStartMission } from "../../tactical/service/start-mission-handler";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { registerDeployableCommands } from "../../overworld/service/deployable-command-handlers";
import { registerEventCommands } from "../../overworld/service/event-command-handlers";
import type { TickDeps } from "../../overworld/service/default-tick-steps";
import type { MissionTypeCatalogue } from "../../overworld/model/mission-type-catalogue";
import { ACTS } from "../../overworld/data/acts";
import { MISSION_CONSEQUENCE_RULES } from "../../overworld/service/missions/mission-consequence-rules";
import { MISSION_OFFER_DECORATORS } from "../../overworld/service/missions/mission-offer-decorators";
import { MISSION_OFFER_RULES } from "../../overworld/service/missions/mission-offer-rules";
import { STORY_SPINE } from "../../overworld/data/story-spine";
import { campaignTechConditions } from "../../overworld/service/campaign-tech-conditions";
import { STORY_MISSION_RULES } from "../../overworld/service/story/story-mission-rules";
import type { StoryDeps } from "../../overworld/service/story-service";
import { onTechUnlocked } from "../../overworld/service/story-service";
import { createDefaultTickSteps } from "../../overworld/service/default-tick-steps";
import { registerRosterCommands } from "../../overworld/service/roster-command-handlers";
import { registerTechCommands } from "../../overworld/service/tech-command-handlers";
import { TECH_DEV_TOOLS } from "../../tech/data/tech-dev-tools";
import type { TechDevTools } from "../../tech/model/tech-dev-tools";
import { TECH_FAMILIES } from "../../tech/data/tech-families";
import { TECH_NODES } from "../../tech/data/tech-tree";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { StaticTechCatalogue } from "../../tech/repository/static-tech-catalogue";
import { createPartAvailability } from "../../tech/service/part-availability-service";
import { createSquadTypeAvailability } from "../../tech/service/squad-type-availability-service";
import type { DevTools, TacticalComposition } from "./tactical-composition";
import { composeTactical } from "./tactical-composition";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import type { UnitTuning } from "../../tactical/model/unit-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { LoadoutMechRater } from "../../roster/service/loadout-mech-rater";
import { ROSTER_TUNING } from "../../roster/data/roster-tuning";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { INFANTRY_UPGRADES } from "../../roster/data/infantry-upgrades";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { AUTOSAVE_SLOT_ID } from "../../save/data/save-slots";
import type { GameState } from "../../save/model/game-state";
import type { KeyValueStore } from "../../save/model/key-value-store";
import type { SaveClock } from "../../save/model/save-clock";
import type { GameSaveService } from "../../save/service/game-save-service";
import { createGameSaveService } from "../../save/service/game-save-service";
import type { NewGameOptions } from "../../save/service/game-state-factory";
import type {
  InfantryUpgradeDefinition,
  InfantryUpgradeId,
} from "../../roster/model/infantry-upgrade";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import type { RosterTuning } from "../../roster/model/roster-tuning";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { UpgradeTuning } from "../../roster/model/upgrade-tuning";
import type { NewGameDeps } from "../../save/service/new-game-service";
import { createNewGame } from "../../save/service/new-game-service";
import type { GameSession } from "../../ui/model/game-session";
import type { AutosaveFailureListener } from "./autosave-service";
import { AutosaveService } from "./autosave-service";
import type { StoreObserver } from "./game-session";
import { StoreGameSession } from "./game-session";
import type { ResearchRevealListener } from "./research-reveal-watcher";
import { createResearchRevealWatcher } from "./research-reveal-watcher";
import { GameStore } from "./game-store";

// ===========================================
// Types
// ===========================================

/** What the environment supplies: storage, time, entropy and a failure sink. */
export interface GameCompositionDeps {
  /** Backing store for save slots; the app passes localStorage, tests a memory store. */
  readonly storage: KeyValueStore;
  /** Wall clock for save stamps and `createdAt`. */
  readonly clock: SaveClock;
  /** Fresh seed for a new campaign; the app passes core's `randomSeed`. */
  readonly newSeed: () => number;
  /** Told about every failed autosave. */
  readonly onAutosaveFailure: AutosaveFailureListener;
  /** Extra observer attached to every campaign store beside autosave; the map scene sync, for instance. */
  readonly onStore?: StoreObserver;
  /**
   * Told when a command brings tech nodes out of hiding (ADR 0013
   * §2.7): the autopsy a first kill reveals, for instance (campaign arc
   * §8). The bootstrap turns it into a notice; absent, nobody is told.
   */
  readonly onResearchRevealed?: ResearchRevealListener;
  /**
   * Test and tuning switches for this session (#78), applied to the
   * shipped tuning here and never written into a save, so they cannot
   * travel to a production build (#304). The bootstrap passes them only
   * in dev builds.
   */
  readonly debug?: CampaignDebugOptions;
  /**
   * Whether this is a dev build (#1136): the bootstrap passes
   * `import.meta.env.DEV`, tests pass what they mean to test. It turns
   * on the tactical development tools — the `PlaceUnit` handler and the
   * debug menu — and nothing else; absent means a production build.
   */
  readonly devTools?: boolean;
  /**
   * The story missions and the spine (ADR 0013 §2.5): the day tick pins
   * from these rules and the launch handler resolves through them.
   * Absent means the shipped `STORY_MISSION_RULES` and `STORY_SPINE`;
   * tests pass fixture rules for the story missions not built yet, to
   * reach an act the shipped build cannot.
   */
  readonly story?: StoryDeps;
}

/** Shipped content and tuning screens read to label and price things. */
export interface GameContent {
  readonly squadTypes: SquadTypeCatalogue;
  readonly parts: PartCatalogue;
  readonly rosterTuning: RosterTuning;
  readonly upgrades: UpgradeTuning;
  readonly rating: MechRatingTuning;
  /** Turns roster entries into field numbers; the mech bay prints them (#1132). */
  readonly unitTuning: UnitTuning;
  /** Names and describes mission types for the mission list and briefing. */
  readonly missionTypes: MissionTypeCatalogue;
  /** Copy and choices for the event dialog. */
  readonly eventTypes: EventTypeCatalogue;
  /** The tech tree (#1171): nodes, families and what each unlocks. */
  readonly tech: TechCatalogue;
  /**
   * What each infantry upgrade the tree grants does (campaign arc
   * §10.3): the mission start folds the unlocked ones into every squad,
   * and the roster names them.
   */
  readonly infantryUpgrades: Readonly<
    Record<InfantryUpgradeId, InfantryUpgradeDefinition>
  >;
  /** Hive levels for the region panel (campaign arc §6.5). */
  readonly hiveTuning: HiveTuning;
}

/** The simulation-facing services screens are handed. */
export interface GameComposition {
  readonly saves: GameSaveService;
  readonly session: GameSession;
  /** Command handlers are registered here; exposed so tests and later wiring can add them. */
  readonly dispatcher: CommandDispatcher<GameState>;
  /** Builds a complete campaign from the shipped content. */
  readonly createCampaign: (options: NewGameOptions) => GameState;
  /** Rates a planned deployment the way the mission resolver will. */
  readonly assessor: DeploymentAssessor;
  readonly newSeed: () => number;
  readonly clock: SaveClock;
  /** The catalogues and tuning the dispatcher was wired with, for screens. */
  readonly content: GameContent;
  /** The tactical side: registered rule handlers and mission-start deps (#342). */
  readonly tactical: TacticalComposition;
  /**
   * True when this session resolves missions with the M1 auto-resolver
   * rather than playing them out (`?autoResolve=1`, #341). The deployment
   * screen reads it to choose which command Launch dispatches.
   */
  readonly autoResolve: boolean;
  /**
   * The tactical development tools (#1136), in a dev build; undefined
   * otherwise, and then no screen renders anything of them.
   */
  readonly devTools: DevTools | undefined;
  /**
   * The tech tree's development tools (#1171), in a dev build; undefined
   * otherwise, and then the tree renders no Free TP button.
   */
  readonly techDevTools: TechDevTools | undefined;
  /**
   * The campaign's conditions as the tech tree sees them (ADR 0013
   * §2.7): which flags are set, including a `killed:<species>` flag per
   * species killed, so which nodes are hidden. The unlock handler was
   * wired with this same function, and the tech tree screen and the
   * mech bay must be handed it too, so a card never shows what the
   * command refuses and a lock never names a hidden node.
   */
  readonly techConditionsOf: (state: GameState) => TechConditions;
}

// ===========================================
// Composition
// ===========================================

/**
 * Builds every simulation-facing service once and wires them together.
 * Nothing outside this function constructs a dispatcher, store, save
 * service or campaign factory; the DOM bootstrap composes presentation
 * and hands screens what it gets from here.
 *
 * ```
 *   storage ──► GameSaveService ──► AutosaveService ─┐
 *                                                    │ observes
 *   dispatcher ──► GameStore(state) ◄── StoreGameSession.start(state)
 *                       ▲
 *   shipped content ──► createCampaign(options)
 * ```
 *
 * Command handlers are registered on `dispatcher` here: the roster
 * commands (#63), the deployable commands (#65), `AdvanceDay` (#68), which
 * runs the default tick pipeline over the shipped content, #70's events,
 * `UnlockTech` (#1171), the tactical rules (#342), and the mission
 * lifecycle (#341):
 *
 * ```
 *   StartMission  ──► TacticalMissionResolver.beginMission ──► activeMission
 *   FinishMission ──► LaunchMission ──► resolver ──► MissionResult, slot cleared
 *
 *   resolver = TacticalMissionResolver          (the shipped game)
 *            | AutoResolveMissionResolver       (?autoResolve=1, for QA)
 * ```
 *
 * The lifecycle goes on last because the M2 resolver reads the finished
 * mission out of the campaign the session's store is holding. Anything
 * unregistered is rejected as `unknown-command` and the store stays put.
 */
export function composeGame(deps: GameCompositionDeps): GameComposition {
  const saves = createGameSaveService(deps.storage, deps.clock);
  const dispatcher = createOverworldCommandDispatcher<GameState>();
  const squadTypes = new DataSquadTypeCatalogue(SQUAD_TYPES);
  const content: GameContent = {
    squadTypes,
    parts: new StaticPartCatalogue(STARTER_PARTS),
    rosterTuning: ROSTER_TUNING,
    upgrades: UPGRADE_TUNING,
    rating: MECH_RATING_TUNING,
    unitTuning: UNIT_TUNING,
    missionTypes: MISSION_TYPES,
    eventTypes: new DataEventTypeCatalogue(
      EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
    ),
    tech: new StaticTechCatalogue(TECH_NODES, Object.values(TECH_FAMILIES)),
    infantryUpgrades: INFANTRY_UPGRADES,
    hiveTuning: HIVE_TUNING,
  };
  const techPoints = new TechPointTreasury();
  registerRosterCommands(dispatcher, {
    ...content,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
    availabilityFor: (state) =>
      createPartAvailability(content.tech, content.parts, state.tech),
    squadTypeAvailabilityFor: (state) =>
      createSquadTypeAvailability(content.tech, state.tech),
  });
  registerTechCommands(dispatcher, {
    catalogue: content.tech,
    techPoints,
    conditionsOf: techConditionsOf,
    onUnlocked: onTechUnlocked,
    devTools: deps.devTools === true,
  });
  const story = deps.story ?? SHIPPED_STORY;
  const tickDeps = composeTickDeps(deps.debug, story);
  registerDeployableCommands(dispatcher, {
    catalogue: tickDeps.catalogue,
    transactionsFor: tickDeps.createTransactions,
  });
  registerEventCommands(dispatcher, {
    eventTypes: tickDeps.eventTypes,
    transactionsFor: tickDeps.createTransactions,
  });
  dispatcher.register(
    ADVANCE_DAY,
    createAdvanceDayHandler(createDefaultTickSteps<GameState>(tickDeps), {
      catalogue: tickDeps.catalogue,
    }),
  );
  const mechRater = new LoadoutMechRater(
    content.parts,
    MECH_RATING_TUNING,
    content.upgrades,
  );
  const assessor = createDeploymentAssessor({
    squadTypes: content.squadTypes,
    mechRater,
    tuning: AUTO_RESOLVE_TUNING,
  });
  const tactical = composeTactical(dispatcher, content, undefined, {
    devTools: deps.devTools === true,
  });
  const autosave = new AutosaveService(
    saves,
    AUTOSAVE_SLOT_ID,
    deps.onAutosaveFailure,
  );
  const watchReveals =
    deps.onResearchRevealed === undefined
      ? undefined
      : createResearchRevealWatcher({
          catalogue: content.tech,
          conditionsOf: techConditionsOf,
          onRevealed: deps.onResearchRevealed,
        });
  const session = new StoreGameSession(
    (state) => new GameStore(state, dispatcher),
    (store) => {
      const detachAutosave = autosave.attach(store);
      const detachReveals = watchReveals?.(store);
      const detachExtra = deps.onStore?.(store);
      return () => {
        detachAutosave();
        detachReveals?.();
        detachExtra?.();
      };
    },
  );
  const newGameDeps = composeNewGameDeps(squadTypes, deps.debug);

  // The mission lifecycle is wired last because it needs the session:
  // the M2 resolver reads the finished mission out of the campaign the
  // store is holding, which is the state `FinishMission` was called on.
  const autoResolve = deps.debug?.autoResolve ?? false;
  const tacticalResolver = tactical.resolverFor(
    () => session.state?.activeMission,
  );
  const resolver: MissionResolver = autoResolve
    ? new AutoResolveMissionResolver({
        squadTypes: content.squadTypes,
        mechRater,
        tuning: AUTO_RESOLVE_TUNING,
      })
    : tacticalResolver;
  const launch = createLaunchMissionHandler<GameState>({
    resolver,
    rosterTuning: content.rosterTuning,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
    techPoints,
    consequences: MISSION_CONSEQUENCE_RULES,
    missionTuning: MISSION_TUNING,
    hiveTuning: tickDeps.hiveTuning,
    story,
  });
  dispatcher.register(LAUNCH_MISSION, launch);
  registerStartMission(dispatcher, {
    starter: tacticalResolver,
    startOptionsFor: createGarrisonStartOptions(tickDeps.catalogue),
  });
  registerFinishMission(dispatcher, { launch });

  return {
    saves,
    session,
    dispatcher,
    createCampaign: (options) => createNewGame(options, newGameDeps),
    assessor,
    newSeed: deps.newSeed,
    clock: deps.clock,
    content,
    tactical,
    autoResolve,
    devTools: tactical.devTools,
    techDevTools: deps.devTools === true ? TECH_DEV_TOOLS : undefined,
    techConditionsOf,
  };
}

// ===========================================
// Constants
// ===========================================

/** The story the shipped game runs: the built story missions on the shipped spine. */
const SHIPPED_STORY: StoryDeps = {
  rules: STORY_MISSION_RULES,
  spine: STORY_SPINE,
};

// ===========================================
// Helpers
// ===========================================

/**
 * The campaign's conditions for the tech tree (ADR 0013 §2.7): the
 * story's flags plus a `killed:<species>` flag per species killed
 * (`campaignTechConditions`). The unlock handler, the tech tree screen
 * and the mech bay are all handed this one function, so they agree on
 * which nodes are hidden. The unlock hook (`onTechUnlocked`) is what
 * turns a researched node's flag effects into flags here.
 */
function techConditionsOf(state: GameState): TechConditions {
  return campaignTechConditions(state.overworld.progress);
}

/** The shipped content, tuning and services the day tick runs on, pinning from `story`. */
function composeTickDeps(
  debug: CampaignDebugOptions | undefined,
  story: StoryDeps,
): TickDeps {
  return {
    catalogue: new DataDeployableTypeCatalogue(
      DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
    ),
    createTransactions: (ids) => new LedgerTransactionService(ids),
    infestationTuning: INFESTATION_TUNING,
    missionTuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    missionOffers: MISSION_OFFER_RULES,
    missionConsequences: MISSION_CONSEQUENCE_RULES,
    offerDecorators: MISSION_OFFER_DECORATORS,
    acts: ACTS,
    storyMissions: story.rules,
    threatTuning: applyDebugThreat(THREAT_TUNING, debug),
    economyTuning: ECONOMY_TUNING,
    eventTypes: new DataEventTypeCatalogue(
      EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
    ),
    eventTuning: EVENT_TUNING,
    hiveTuning: HIVE_TUNING,
  };
}

/** The shipped content and tuning a new campaign is built from. */
function composeNewGameDeps(
  squadTypes: DataSquadTypeCatalogue,
  debug: CampaignDebugOptions | undefined,
): NewGameDeps {
  return {
    map: EARTH_MAP,
    squadTypes,
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: applyDebugThreat(THREAT_TUNING, debug),
    economyTuning: ECONOMY_TUNING,
  };
}
