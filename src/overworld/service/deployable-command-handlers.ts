import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { BuildDeployableCommand } from "../model/build-deployable-command";
import { BUILD_DEPLOYABLE } from "../model/build-deployable-command";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler, CommandOutcome } from "../model/command-handler";
import type { DecommissionDeployableCommand } from "../model/decommission-deployable-command";
import { DECOMMISSION_DEPLOYABLE } from "../model/decommission-deployable-command";
import { describeDeployableError } from "../model/deployable-error";
import type { DeployableTypeCatalogue } from "../model/deployable-type-catalogue";
import type { DeployableResult } from "./deployable-service";
import { buildDeployable, decommissionDeployable } from "./deployable-service";

// ===========================================
// Types
// ===========================================

/** Content and services the deployable handlers close over; `ids` come from the command context. */
export interface DeployableHandlerDeps {
  readonly catalogue: DeployableTypeCatalogue;
  /**
   * Builds the transaction service for one command over the context's
   * id generator, so ledger ids share the campaign's counters.
   */
  readonly transactionsFor: (ids: IdGenerator) => TransactionService;
}

/** One handler per deployable command, ready to register. */
export interface DeployableCommandHandlers<TState extends CampaignState> {
  readonly buildDeployable: CommandHandler<TState, BuildDeployableCommand>;
  readonly decommissionDeployable: CommandHandler<
    TState,
    DecommissionDeployableCommand
  >;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Adapts the pure deployable service to the dispatcher's handler shape:
 * each handler runs the service with the campaign day and the context's
 * ids, puts the returned slices back, and folds a `DeployableError` into
 * a `CommandError` whose `code` is the deployable code.
 */
export function createDeployableCommandHandlers<TState extends CampaignState>(
  deps: DeployableHandlerDeps,
): DeployableCommandHandlers<TState> {
  return {
    buildDeployable: (state, command, ctx) =>
      lift(
        state,
        buildDeployable(
          state,
          command.payload.typeId,
          command.payload.regionId,
          state.overworld.day,
          {
            catalogue: deps.catalogue,
            transactions: deps.transactionsFor(ctx.ids),
            ids: ctx.ids,
          },
        ),
      ),
    decommissionDeployable: (state, command) =>
      lift(state, decommissionDeployable(state, command.payload.deployableId)),
  };
}

/** Registers both deployable handlers on `dispatcher`. Called once at the composition root. */
export function registerDeployableCommands<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: DeployableHandlerDeps,
): void {
  const handlers = createDeployableCommandHandlers<TState>(deps);
  dispatcher.register(BUILD_DEPLOYABLE, handlers.buildDeployable);
  dispatcher.register(DECOMMISSION_DEPLOYABLE, handlers.decommissionDeployable);
}

// ===========================================
// Private Functions
// ===========================================

/** Puts the service's slices back into the campaign, or folds its error. */
function lift<TState extends CampaignState>(
  state: TState,
  result: DeployableResult,
): CommandOutcome<TState> {
  if (!result.ok) {
    return err(
      commandError(result.error.code, describeDeployableError(result.error)),
    );
  }
  return ok({
    state: {
      ...state,
      overworld: result.value.overworld,
      economy: result.value.economy,
    },
    events: result.value.events,
  });
}
