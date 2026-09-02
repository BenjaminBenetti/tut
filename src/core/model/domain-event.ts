/**
 * Something that happened inside the simulation as a result of applying
 * a command. Presentation animates events; it never inspects state diffs.
 * Events are plain data so they can be serialized into replays.
 */
export interface DomainEvent<
  TType extends string = string,
  TPayload = unknown,
> {
  readonly type: TType;
  readonly payload: TPayload;
}

/**
 * The outcome of applying a command: the next state plus the events that
 * describe what changed. State is never mutated in place.
 *
 * ```
 *   (state, command) ──► service ──► { state', events[] }
 * ```
 */
export interface Applied<TState, TEvent extends DomainEvent = DomainEvent> {
  readonly state: TState;
  readonly events: readonly TEvent[];
}
