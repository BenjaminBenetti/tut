import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { MechRatingTuning } from "../../roster/model/mech-rating-tuning";
import type { PartCatalogue } from "../../roster/model/part-catalogue";
import { describeRosterError } from "../../roster/model/roster-error";
import type { RosterResult } from "../../roster/service/roster-service";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import {
  buildMech,
  deleteLoadout,
  hireSquad,
  reinforceSquad,
  saveLoadout,
} from "../../roster/service/roster-service";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler, CommandOutcome } from "../model/command-handler";
import type {
  BuildMechCommand,
  DeleteLoadoutCommand,
  HireSquadCommand,
  ReinforceSquadCommand,
  SaveLoadoutCommand,
} from "../model/overworld-command";
import {
  BUILD_MECH,
  DELETE_LOADOUT,
  HIRE_SQUAD,
  REINFORCE_SQUAD,
  SAVE_LOADOUT,
} from "../model/overworld-command";

// ===========================================
// Types
// ===========================================

/** Content and services the roster handlers close over; `ids` come from the command context. */
export interface RosterHandlerDeps {
  readonly squadTypes: SquadTypeCatalogue;
  readonly parts: PartCatalogue;
  readonly rating: MechRatingTuning;
  /**
   * Builds the transaction service for one command over the context's
   * id generator, so ledger ids share the campaign's counters.
   */
  readonly transactionsFor: (ids: IdGenerator) => TransactionService;
}

/** One handler per roster command, ready to register. */
export interface RosterCommandHandlers<TState extends CampaignState> {
  readonly hireSquad: CommandHandler<TState, HireSquadCommand>;
  readonly reinforceSquad: CommandHandler<TState, ReinforceSquadCommand>;
  readonly saveLoadout: CommandHandler<TState, SaveLoadoutCommand>;
  readonly deleteLoadout: CommandHandler<TState, DeleteLoadoutCommand>;
  readonly buildMech: CommandHandler<TState, BuildMechCommand>;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Adapts the pure roster service to the dispatcher's handler shape:
 * each handler lifts the roster and economy slices out of the campaign,
 * runs the service with the current day and the context's ids, and folds
 * a `RosterError` into a `CommandError` whose `code` is the roster code.
 *
 * ```
 *   state ──► { roster, economy } ──► roster-service ──► ok  ──► state' (slices replaced)
 *                                                    └──► err ──► CommandError(code, message)
 * ```
 */
export function createRosterCommandHandlers<TState extends CampaignState>(
  deps: RosterHandlerDeps,
): RosterCommandHandlers<TState> {
  /** The service deps for one command. */
  const serviceDeps = (ids: IdGenerator): Parameters<typeof hireSquad>[4] => ({
    squadTypes: deps.squadTypes,
    parts: deps.parts,
    rating: deps.rating,
    transactions: deps.transactionsFor(ids),
    ids,
  });

  return {
    hireSquad: (state, command, ctx) =>
      lift(
        state,
        hireSquad(
          state,
          command.payload.typeId,
          command.payload.name,
          state.overworld.day,
          serviceDeps(ctx.ids),
        ),
      ),
    reinforceSquad: (state, command, ctx) =>
      lift(
        state,
        reinforceSquad(
          state,
          command.payload.squadId,
          command.payload.soldiers,
          state.overworld.day,
          serviceDeps(ctx.ids),
        ),
      ),
    saveLoadout: (state, command, ctx) =>
      lift(
        state,
        saveLoadout(state, command.payload.loadout, serviceDeps(ctx.ids)),
      ),
    deleteLoadout: (state, command) =>
      lift(state, deleteLoadout(state, command.payload.name)),
    buildMech: (state, command, ctx) =>
      lift(
        state,
        buildMech(
          state,
          command.payload.loadoutName,
          command.payload.mechName,
          state.overworld.day,
          serviceDeps(ctx.ids),
        ),
      ),
  };
}

/** Registers every roster handler on `dispatcher`. Called once at the composition root. */
export function registerRosterCommands<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: RosterHandlerDeps,
): void {
  const handlers = createRosterCommandHandlers<TState>(deps);
  dispatcher.register(HIRE_SQUAD, handlers.hireSquad);
  dispatcher.register(REINFORCE_SQUAD, handlers.reinforceSquad);
  dispatcher.register(SAVE_LOADOUT, handlers.saveLoadout);
  dispatcher.register(DELETE_LOADOUT, handlers.deleteLoadout);
  dispatcher.register(BUILD_MECH, handlers.buildMech);
}

// ===========================================
// Private Functions
// ===========================================

/** Puts the service's slices back into the campaign, or folds its error. */
function lift<TState extends CampaignState>(
  state: TState,
  result: RosterResult,
): CommandOutcome<TState> {
  if (!result.ok) {
    return err(
      commandError(result.error.code, describeRosterError(result.error)),
    );
  }
  return ok({
    state: {
      ...state,
      roster: result.value.roster,
      economy: result.value.economy,
    },
    events: result.value.events,
  });
}
