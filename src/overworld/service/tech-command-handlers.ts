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
import type { GrantTechPointsCommand } from "../model/grant-tech-points-command";
import { GRANT_TECH_POINTS } from "../model/grant-tech-points-command";
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
  /**
   * Whether this is a dev build (#1171). Enables `GrantTechPoints`;
   * false — the default — registers the handler refusing, so the
   * command exists everywhere and does something only where it should.
   */
  readonly devTools?: boolean;
}

/** The reference a granted pool is recorded under. */
export const DEV_GRANT_REF = "dev:grant";

/** The code a production build refuses `GrantTechPoints` with. */
export const DEV_TOOLS_DISABLED = "dev-tools-disabled";

/** The code a grant of nothing, or of less, is refused with. */
export const INVALID_GRANT = "invalid-grant";

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

/**
 * The dev build's free points (#1171): earns `amount` through the
 * treasury on the current day, or refuses when the build is not a dev
 * build or the amount is not a positive whole number.
 *
 * ```
 *   devTools off ──► err(dev-tools-disabled)
 *   amount ≤ 0   ──► err(invalid-grant)
 *   otherwise    ──► economy' = earn(amount, "dev:grant", day)
 * ```
 */
export function createGrantTechPointsHandler<TState extends CampaignState>(
  deps: TechHandlerDeps,
): CommandHandler<TState, GrantTechPointsCommand> {
  return (state, command) => {
    if (deps.devTools !== true) {
      return err(
        commandError(
          DEV_TOOLS_DISABLED,
          "Free tech points are a development tool; this build has none.",
        ),
      );
    }
    const amount = command.payload.amount;
    if (!Number.isInteger(amount) || amount <= 0) {
      return err(
        commandError(
          INVALID_GRANT,
          `A grant must be a positive whole number of tech points, not ${String(amount)}.`,
        ),
      );
    }
    const applied = deps.techPoints.earn(
      state.economy,
      amount,
      DEV_GRANT_REF,
      state.overworld.day,
    );
    return ok({
      state: { ...state, economy: applied.state },
      events: applied.events,
    });
  };
}

/** Registers the tech handlers on `dispatcher`. Called once at the composition root. */
export function registerTechCommands<TState extends CampaignState>(
  dispatcher: CommandDispatcher<TState>,
  deps: TechHandlerDeps,
): void {
  dispatcher.register(UNLOCK_TECH, createUnlockTechHandler<TState>(deps));
  dispatcher.register(
    GRANT_TECH_POINTS,
    createGrantTechPointsHandler<TState>(deps),
  );
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
