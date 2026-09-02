import type { Command } from "../../core/model/command";
import type { CommandError } from "../../core/model/command-error";
import type { Applied, DomainEvent } from "../../core/model/domain-event";
import type { Unsubscribe } from "../../core/model/event-bus";
import type { Result } from "../../core/model/result";

// ===========================================
// Change notifications
// ===========================================

/**
 * What subscribers receive when the state is replaced. A `command`
 * change carries the events the simulation emitted so views can animate
 * them; a `replace` change (load game) carries none, and views should
 * rebuild from `state`.
 */
export type StoreChange<TState, TCommand, TEvent extends DomainEvent> =
  | {
      readonly kind: "command";
      readonly command: TCommand;
      readonly state: TState;
      readonly events: readonly TEvent[];
    }
  | {
      readonly kind: "replace";
      readonly state: TState;
      readonly events: readonly [];
    };

/** Receives every state change, in subscription order. */
export type StoreListener<TState, TCommand, TEvent extends DomainEvent> = (
  change: StoreChange<TState, TCommand, TEvent>,
) => void;

/** A rejected command and why it was rejected. State was not changed. */
export interface CommandFailure<TCommand> {
  readonly command: TCommand;
  readonly error: CommandError;
}

/** Receives every rejected command, in subscription order. */
export type CommandFailureListener<TCommand> = (
  failure: CommandFailure<TCommand>,
) => void;

// ===========================================
// Store contracts
// ===========================================

/**
 * Read side of the store: what a view needs to render and stay current.
 * Views that never issue commands depend on this alone.
 */
export interface StateSource<TState, TCommand, TEvent extends DomainEvent> {
  /** The current state. Treat it as immutable. */
  getState(): TState;
  /**
   * Subscribes to state changes and returns the matching unsubscribe.
   * The listener is not invoked for the current state; call `getState`.
   */
  subscribe(listener: StoreListener<TState, TCommand, TEvent>): Unsubscribe;
}

/**
 * Write side of the store: what a view needs to issue commands and hear
 * about the ones that were rejected.
 */
export interface CommandSink<
  TState,
  TCommand extends Command,
  TEvent extends DomainEvent,
> {
  /**
   * Runs the command through the processor. On success the state is
   * replaced and subscribers are notified; on failure nothing changes
   * and error listeners are notified. The result is also returned so
   * the caller can react inline.
   */
  dispatch(command: TCommand): Result<Applied<TState, TEvent>, CommandError>;
  /** Subscribes to rejected commands and returns the matching unsubscribe. */
  onError(listener: CommandFailureListener<TCommand>): Unsubscribe;
}
