import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { LedgerTransactionService } from "../../economy/service/transaction-service";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { DEPLOYABLE_TYPES } from "../../overworld/data/deployable-types";
import { EVENT_TUNING } from "../../overworld/data/event-tuning";
import { EVENT_TYPES } from "../../overworld/data/event-types";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { INFESTATION_TUNING } from "../../overworld/data/infestation-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { CommandDispatcher } from "../../overworld/model/command-dispatcher";
import type { DeploymentAssessor } from "../../overworld/model/deployment-assessment";
import type { EventTypeCatalogue } from "../../overworld/model/event-type-catalogue";
import { DEPLOYABLE_TYPE_IDS } from "../../overworld/model/deployable-type";
import { EVENT_TYPE_IDS } from "../../overworld/model/event-type";
import { ADVANCE_DAY } from "../../overworld/model/overworld-command";
import { DataDeployableTypeCatalogue } from "../../overworld/repository/deployable-type-catalogue";
import { DataEventTypeCatalogue } from "../../overworld/repository/event-type-catalogue";
import { createAdvanceDayHandler } from "../../overworld/service/advance-day-service";
import { AutoResolveMissionResolver } from "../../overworld/service/auto-resolve-mission-resolver";
import { createDeploymentAssessor } from "../../overworld/service/deployment-assessment-service";
import { registerLaunchMission } from "../../overworld/service/launch-mission-service";
import { createOverworldCommandDispatcher } from "../../overworld/service/command-dispatcher";
import { registerDeployableCommands } from "../../overworld/service/deployable-command-handlers";
import { registerEventCommands } from "../../overworld/service/event-command-handlers";
import type { TickDeps } from "../../overworld/service/default-tick-steps";
import type { MissionTypeCatalogue } from "../../overworld/service/mission-generation-service";
import { createDefaultTickSteps } from "../../overworld/service/default-tick-steps";
import { registerRosterCommands } from "../../overworld/service/roster-command-handlers";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { LoadoutMechRater } from "../../roster/service/loadout-mech-rater";
import { ROSTER_TUNING } from "../../roster/data/roster-tuning";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
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
}

/** Shipped content and tuning screens read to label and price things. */
export interface GameContent {
  readonly squadTypes: SquadTypeCatalogue;
  readonly parts: PartCatalogue;
  readonly rosterTuning: RosterTuning;
  readonly upgrades: UpgradeTuning;
  readonly rating: MechRatingTuning;
  /** Names and describes mission types for the mission list and briefing. */
  readonly missionTypes: MissionTypeCatalogue;
  /** Copy and choices for the event dialog. */
  readonly eventTypes: EventTypeCatalogue;
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
 * runs the default tick pipeline over the shipped content, and
 * `LaunchMission` (#67) with the #62 auto-resolver injected as the M1
 * `MissionResolver`. #70 events follow. Anything unregistered is rejected
 * as `unknown-command` and the store stays put.
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
    missionTypes: MISSION_TYPES,
    eventTypes: new DataEventTypeCatalogue(
      EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
    ),
  };
  registerRosterCommands(dispatcher, {
    ...content,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
  });
  const tickDeps = composeTickDeps();
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
  registerLaunchMission(dispatcher, {
    resolver: new AutoResolveMissionResolver({
      squadTypes: content.squadTypes,
      mechRater,
      tuning: AUTO_RESOLVE_TUNING,
    }),
    rosterTuning: content.rosterTuning,
    transactionsFor: (ids) => new LedgerTransactionService(ids),
  });
  const autosave = new AutosaveService(
    saves,
    AUTOSAVE_SLOT_ID,
    deps.onAutosaveFailure,
  );
  const session = new StoreGameSession(
    (state) => new GameStore(state, dispatcher),
    (store) => {
      const detachAutosave = autosave.attach(store);
      const detachExtra = deps.onStore?.(store);
      return () => {
        detachAutosave();
        detachExtra?.();
      };
    },
  );
  const newGameDeps = composeNewGameDeps(squadTypes);

  return {
    saves,
    session,
    dispatcher,
    createCampaign: (options) => createNewGame(options, newGameDeps),
    assessor,
    newSeed: deps.newSeed,
    clock: deps.clock,
    content,
  };
}

// ===========================================
// Helpers
// ===========================================

/** The shipped content, tuning and services the day tick runs on. */
function composeTickDeps(): TickDeps {
  return {
    catalogue: new DataDeployableTypeCatalogue(
      DEPLOYABLE_TYPE_IDS.map((id) => DEPLOYABLE_TYPES[id]),
    ),
    createTransactions: (ids) => new LedgerTransactionService(ids),
    infestationTuning: INFESTATION_TUNING,
    missionTuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
    eventTypes: new DataEventTypeCatalogue(
      EVENT_TYPE_IDS.map((id) => EVENT_TYPES[id]),
    ),
    eventTuning: EVENT_TUNING,
  };
}

/** The shipped content and tuning a new campaign is built from. */
function composeNewGameDeps(squadTypes: DataSquadTypeCatalogue): NewGameDeps {
  return {
    map: EARTH_MAP,
    squadTypes,
    starterRoster: STARTER_ROSTER,
    newGameTuning: NEW_GAME_TUNING,
    threatTuning: THREAT_TUNING,
    economyTuning: ECONOMY_TUNING,
  };
}
