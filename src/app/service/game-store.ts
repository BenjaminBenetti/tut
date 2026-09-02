import type { Command } from "../../core/model/command";
import type { CommandError } from "../../core/model/command-error";
import type { CommandProcessor } from "../../core/model/command-processor";
import type { Applied, DomainEvent } from "../../core/model/domain-event";
import type { Unsubscribe } from "../../core/model/event-bus";
import type { Result } from "../../core/model/result";
import type {
  CommandFailureListener,
  CommandSink,
  StateSource,
  StoreChange,
  StoreListener,
} from "../model/state-store";

/**
 * Holds the current game state and is the one place presentation changes
 * it. Every change goes through an injected `CommandProcessor`; the store
 * itself knows nothing about what the state or commands mean, so it is
 * generic over all three types and free of DOM and three.js.
 *
 * ```
 *   view ──dispatch(cmd)──▶ GameStore ──process(state, cmd)──▶ CommandProcessor
 *                              │                                      │
 *                              │◀──── ok { state', events } ──────────┤
 *                              │◀──── err CommandError ───────────────┘
 *                              │
 *          ok:  state := state'; subscribers({ kind: "command", ... })
 *          err: state untouched; errorListeners({ command, error })
 * ```
 *
 * Notifications are synchronous and run in subscription order against a
 * snapshot of the listeners, so unsubscribing mid-notification never
 * skips anyone. A listener may dispatch again; the nested change is fully
 * delivered before the outer notification continues, so a listener that
 * needs the very latest state should read `getState()` rather than rely
 * on the `change.state` it was handed.
 */
export class GameStore<
  TState,
  TCommand extends Command = Command,
  TEvent extends DomainEvent = DomainEvent,
>
  implements
    StateSource<TState, TCommand, TEvent>,
    CommandSink<TState, TCommand, TEvent>
{
  // ===========================================
  // Fields
  // ===========================================

  private state: TState;
  private readonly processor: CommandProcessor<TState, TCommand, TEvent>;
  private readonly listeners = new Set<
    StoreListener<TState, TCommand, TEvent>
  >();
  private readonly errorListeners = new Set<CommandFailureListener<TCommand>>();

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param initialState - State the store starts with; treated as immutable.
   * @param processor - Applies commands; usually a domain's command dispatcher.
   */
  constructor(
    initialState: TState,
    processor: CommandProcessor<TState, TCommand, TEvent>,
  ) {
    this.state = initialState;
    this.processor = processor;
  }

  // ===========================================
  // StateSource
  // ===========================================

  /** The current state. Treat it as immutable. */
  getState(): TState {
    return this.state;
  }

  /**
   * Subscribes to state changes and returns the matching unsubscribe.
   * The listener is not invoked for the current state; call `getState`.
   */
  subscribe(listener: StoreListener<TState, TCommand, TEvent>): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ===========================================
  // CommandSink
  // ===========================================

  /**
   * Runs the command through the processor. On success the state is
   * replaced and subscribers are notified with the new state and the
   * emitted events; on failure the state is untouched and error
   * listeners are notified. The processor's result is returned either
   * way. A processor that throws is a bug, not a rejection: the throw
   * propagates and the state stays as it was.
   */
  dispatch(command: TCommand): Result<Applied<TState, TEvent>, CommandError> {
    const result = this.processor.process(this.state, command);
    if (result.ok) {
      this.state = result.value.state;
      this.notify({
        kind: "command",
        command,
        state: result.value.state,
        events: result.value.events,
      });
    } else {
      const failure = { command, error: result.error };
      for (const listener of [...this.errorListeners]) {
        listener(failure);
      }
    }
    return result;
  }

  /** Subscribes to rejected commands and returns the matching unsubscribe. */
  onError(listener: CommandFailureListener<TCommand>): Unsubscribe {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  // ===========================================
  // Loading
  // ===========================================

  /**
   * Swaps in a whole new state, bypassing the processor. Used when a
   * saved game is loaded. Subscribers receive a `replace` change with
   * no events and should rebuild from the state.
   */
  replaceState(state: TState): void {
    this.state = state;
    this.notify({ kind: "replace", state, events: [] });
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Delivers a change to a snapshot of the current subscribers, in
   * subscription order.
   */
  private notify(change: StoreChange<TState, TCommand, TEvent>): void {
    for (const listener of [...this.listeners]) {
      listener(change);
    }
  }
}
