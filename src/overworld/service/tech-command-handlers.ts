import { commandError } from "../../core/model/command-error";
import { err, ok } from "../../core/model/result";
import type { TechPointService } from "../../economy/model/tech-point-service";
import type { TechCatalogue } from "../../tech/model/tech-catalogue";
import type { TechConditions } from "../../tech/model/tech-conditions";
import { describeTechError } from "../../tech/model/tech-error";
import type { TechNode, TechNodeId } from "../../tech/model/tech-node";
import type { TechResult } from "../../tech/service/unlock-service";
import { unlockTech } from "../../tech/service/unlock-service";
import type { CampaignApplied } from "../model/campaign-event";
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

/**
 * What the tech handlers close over. Generic over the state the
 * dispatcher drives, so the unlock hook hands back the same shape it was
 * given.
 */
export interface TechHandlerDeps<TState extends CampaignState = CampaignState> {
  readonly catalogue: TechCatalogue;
  /** The one door tech points move through. */
  readonly techPoints: TechPointService;
  /**
   * The campaign's conditions, which decide which nodes are hidden
   * (ADR 0013 §2.7). `tech/` never reads the campaign itself, so the
   * handler asks this for every unlock. The composition root supplies
   * it; the tech tree screen must be handed the same function, or a
   * card could show a node the command refuses as hidden.
   */
  readonly conditionsOf: (state: TState) => TechConditions;
  /**
   * Applies the effects of a node beyond its parts after a successful
   * unlock: setting flags, pinning story missions (ADR 0013 §2.5). Runs
   * on the state with the unlock already applied, and its events follow
   * the unlock's. Absent — the default until the story spine lands — it
   * does nothing.
   */
  readonly onUnlocked?: (
    state: TState,
    node: TechNode,
  ) => CampaignApplied<TState>;
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
 * the tech and economy slices, run the service with the current day and
 * the campaign's conditions, fold a `TechError` into a `CommandError`
 * whose `code` is the tech code, and on success hand the new state to
 * the `onUnlocked` hook for the node's effects beyond parts.
 *
 * ```
 *   state ──► conditionsOf(state) ──► unlockTech ──► err ──► CommandError(code, message)
 *                                               └──► ok  ──► state' (slices replaced)
 *                                                            └──► onUnlocked(state', node) ──► state''
 *                                                                 events: unlock's, then the hook's
 * ```
 */
export function createUnlockTechHandler<TState extends CampaignState>(
  deps: TechHandlerDeps<TState>,
): CommandHandler<TState, UnlockTechCommand> {
  return (state, command) => {
    const nodeId = command.payload.nodeId;
    const lifted = lift(
      state,
      unlockTech(
        state,
        nodeId,
        state.overworld.day,
        deps.conditionsOf(state),
        deps,
      ),
    );
    if (!lifted.ok || deps.onUnlocked === undefined) {
      return lifted;
    }
    return ok(
      afterUnlock(lifted.value, nodeId, deps.catalogue, deps.onUnlocked),
    );
  };
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
  deps: Pick<TechHandlerDeps<TState>, "techPoints" | "devTools">,
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
  deps: TechHandlerDeps<TState>,
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

/**
 * Runs the unlock hook over a successful unlock and appends its events.
 * The node is known here, since `unlockTech` accepted it; a catalogue
 * that has lost it since leaves the unlock as it was.
 */
function afterUnlock<TState extends CampaignState>(
  unlocked: CampaignApplied<TState>,
  nodeId: TechNodeId,
  catalogue: TechCatalogue,
  onUnlocked: (state: TState, node: TechNode) => CampaignApplied<TState>,
): CampaignApplied<TState> {
  const node = catalogue.getNode(nodeId);
  if (node === undefined) {
    return unlocked;
  }
  const hooked = onUnlocked(unlocked.state, node);
  return {
    state: hooked.state,
    events: [...unlocked.events, ...hooked.events],
  };
}
