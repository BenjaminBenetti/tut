import type { CommandProcessor } from "../../core/model/command-processor";
import type { CampaignState } from "./campaign-state";
import type { CommandHandler } from "./command-handler";
import type {
  CommandFor,
  OverworldCommand,
  OverworldCommandType,
} from "./overworld-command";
import type { CampaignEvent } from "./campaign-event";

// ===========================================
// Error codes
// ===========================================

/** `CommandError.code` when no handler is registered for a command's type. */
export const UNKNOWN_COMMAND = "unknown-command";

// ===========================================
// Dispatcher
// ===========================================

/**
 * The overworld's `CommandProcessor`: routes each command to the handler
 * registered for its `type`. New commands are added by registration at
 * the composition root, never by editing the dispatcher (open/closed).
 * The app store drives `process`; `register` is for wiring and tests.
 *
 * ```
 *   register(type, handler)          process(state, command)
 *          │                                  │
 *          ▼                                  ▼
 *   handlers: Map<type, handler> ──lookup──► handler(state, command, ctx)
 *                                              │
 *                          unknown type ──► err UNKNOWN_COMMAND
 * ```
 */
export interface CommandDispatcher<
  TState extends CampaignState,
> extends CommandProcessor<TState, OverworldCommand, CampaignEvent> {
  /**
   * Registers the one handler for a command type.
   *
   * @throws {Error} if a handler for `type` is already registered; that
   *   is a wiring mistake, not a game state.
   */
  register<TType extends OverworldCommandType>(
    type: TType,
    handler: CommandHandler<TState, CommandFor<TType>>,
  ): void;
}
