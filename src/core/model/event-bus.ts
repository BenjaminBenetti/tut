/**
 * Map from event name to payload type. Each consumer declares its own,
 * e.g. `{ "screen:changed": { screen: ScreenId } }`.
 */
export type EventMap = Record<string, unknown>;

/** Callback invoked with an event's payload. */
export type EventListener<TPayload> = (payload: TPayload) => void;

/** Removes the listener it was returned for. */
export type Unsubscribe = () => void;

/**
 * Typed publish/subscribe channel for presentation and app plumbing.
 * Simulation does not use it: simulation returns event lists from
 * commands (see `Applied`). The bus is how those lists reach views.
 */
export interface EventBus<TEvents extends EventMap> {
  /** Subscribes to an event and returns a function that unsubscribes. */
  on<K extends keyof TEvents & string>(
    type: K,
    listener: EventListener<TEvents[K]>,
  ): Unsubscribe;

  /** Publishes an event to every current listener, in subscription order. */
  emit<K extends keyof TEvents & string>(type: K, payload: TEvents[K]): void;
}
