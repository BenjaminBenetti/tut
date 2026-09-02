import type { Command } from "./command";
import type { CommandError } from "./command-error";
import type { Applied, DomainEvent } from "./domain-event";
import type { Result } from "./result";

/**
 * Validates and applies one command to a state, returning the next state
 * and the events that describe what changed, or a typed error. Pure:
 * the input state is never mutated and nothing is thrown for an invalid
 * command. Simulation domains implement this (the overworld command
 * dispatcher, for instance); the app store drives it.
 *
 * ```
 *   store.dispatch(cmd) ──▶ processor.process(state, cmd)
 *                                   │
 *                     ok ◀──────────┴──────────▶ err
 *                { state', events }          CommandError
 * ```
 */
export interface CommandProcessor<
  TState,
  TCommand extends Command = Command,
  TEvent extends DomainEvent = DomainEvent,
> {
  /** Applies `command` to `state` without mutating either. */
  process(
    state: TState,
    command: TCommand,
  ): Result<Applied<TState, TEvent>, CommandError>;
}
