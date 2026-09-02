import type {
  EventBus,
  EventListener,
  EventMap,
  Unsubscribe,
} from "../model/event-bus";

// ===========================================
// SimpleEventBus
// ===========================================

/**
 * Minimal synchronous event bus. Listeners run in subscription order;
 * a listener that unsubscribes during dispatch does not affect the
 * listeners already scheduled for that emit.
 */
export class SimpleEventBus<
  TEvents extends EventMap,
> implements EventBus<TEvents> {
  // ===========================================
  // Fields
  // ===========================================

  private readonly listeners = new Map<string, Set<EventListener<never>>>();

  // ===========================================
  // EventBus
  // ===========================================

  /** Subscribes and returns the matching unsubscribe function. */
  on<K extends keyof TEvents & string>(
    type: K,
    listener: EventListener<TEvents[K]>,
  ): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Dispatches synchronously to a snapshot of the current listeners. */
  emit<K extends keyof TEvents & string>(type: K, payload: TEvents[K]): void {
    const set = this.listeners.get(type);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      (listener as EventListener<TEvents[K]>)(payload);
    }
  }
}
