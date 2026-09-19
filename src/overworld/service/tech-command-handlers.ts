import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { TechPointService } from "../../economy/model/tech-point-service";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import { describeTechError } from "../../tech/model/tech-error";
import type { TechResult } from "../../tech/service/unlock-service";
import { unlockTech } from "../../tech/service/unlock-service";
import type { CampaignState } from "../model/campaign-state";
import type { CommandDispatcher } from "../model/command-dispatcher";
import type { CommandHandler, CommandOutcome } from "../model/command-handler";
import type { UnlockTechCommand } from "../model/unlock-tech-command";
import { UNLOCK_TECH } from "../model/unlock-tech-command";

// ===========================================
// Types
// ===========================================

/** What the tech handlers close over. */
export interface TechHandlerDeps {
  readonly catalogue: TechCatalogue;
  /** The one door tech points move through. */
  readonly techPoints: TechPointService;
}

// ===========================================
// Public Functions
// ===========================================

/**
 * Adapts the pure unlock service to the dispatcher's handler shape: lift
 * the tech and economy slices, run the service with the current day, and
 * fold a `TechError` into a `CommandError` whose `code` is the tech code.
 *
 * ```
 *   state ──► { tech, economy } ──► unlockTech ──► ok  ──► state' (slices replaced)
 *                                              └──► err ──► CommandError(code, message)
 * ```
 */
export function createUnlockTechHandler<TState extends CampaignState>(
  deps: TechHandlerDeps,
): CommandHandler<TState, UnlockTechCommand> {
  return (state, command) =>
    lift(
      state,
      unlockTech(state, command.payload.nodeId, state.overworld.day, deps),
    );
}

/** Registers the tech handlers on `dispatcher`. Called once at the composition root. */
export function registerTechCommands<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: TechHandlerDeps,
): void {
  dispatcher.register(UNLOCK_TECH, createUnlockTechHandler<TState>(deps));
}

// ===========================================
// Private Functions
// ===========================================

/** Puts the service's slices back into the campaign, or folds its error. */
function lift<TState extends CampaignState>(
  state: TState,
  result: TechResult,
): CommandOutcome<TState> {
  if (!result.ok) {
    return err(
      commandError(result.error.code, describeTechError(result.error)),
    );
  }
  return ok({
    state: { ...state, tech: result.value.tech, economy: result.value.economy },
    events: result.value.events,
  });
}
