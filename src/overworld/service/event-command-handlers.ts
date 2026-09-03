import { commandError } from "../../core/model/command-error";
import type { IdGenerator } from "../../core/model/id-generator";
import { err, ok } from "../../core/model/result";
import type { TransactionService } from "../../economy/model/transaction-service";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler, CommandOutcome } from "../model/command-handler";
import { describeEventResolutionError } from "../model/event-resolution-error";
import type { EventTypeCatalogue } from "../model/event-type-catalogue";
import type { ResolveEventCommand } from "../model/resolve-event-command";
import { RESOLVE_EVENT } from "../model/resolve-event-command";
import type { EventResolutionResult } from "./event-resolution-service";
import { resolveEvent } from "./event-resolution-service";

// ===========================================
// Types
// ===========================================

/** Content and services the event handlers close over; `ids` come from the command context. */
export interface EventHandlerDeps {
  readonly eventTypes: EventTypeCatalogue;
  /**
   * Builds the transaction service for one command over the context's
   * id generator, so ledger ids share the campaign's counters.
   */
  readonly transactionsFor: (ids: IdGenerator) => TransactionService;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Adapts the pure resolution service to the dispatcher's handler shape:
 * runs it with the campaign day and the context's ids, puts the returned
 * slices back, and folds an `EventResolutionError` into a
 * `CommandError` whose `code` is the resolution code.
 */
export function createResolveEventHandler<TState extends CampaignState>(
  deps: EventHandlerDeps,
): CommandHandler<TState, ResolveEventCommand> {
  return (state, command, ctx) =>
    lift(
      state,
      resolveEvent(
        state,
        command.payload.eventId,
        command.payload.choiceId,
        state.overworld.day,
        {
          eventTypes: deps.eventTypes,
          transactions: deps.transactionsFor(ctx.ids),
        },
      ),
    );
}

/** Registers `ResolveEvent` on `dispatcher`. Called once at the composition root. */
export function registerEventCommands<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: EventHandlerDeps,
): void {
  dispatcher.register(RESOLVE_EVENT, createResolveEventHandler<TState>(deps));
}

// ===========================================
// Private Functions
// ===========================================

/** Puts the service's slices back into the campaign, or folds its error. */
function lift<TState extends CampaignState>(
  state: TState,
  result: EventResolutionResult,
): CommandOutcome<TState> {
  if (!result.ok) {
    return err(
      commandError(
        result.error.code,
        describeEventResolutionError(result.error),
      ),
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
