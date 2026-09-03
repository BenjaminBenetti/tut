import type { EventBus, EventMap } from "../../core/model/event-bus";
import type { ScreenId } from "./screen";

// ===========================================
// Events
// ===========================================

/** Payload of `screen:changed`. `from` is undefined on the first navigation. */
export interface ScreenChanged {
  readonly from: ScreenId | undefined;
  readonly to: ScreenId;
}

/** Events a `ScreenRouter` publishes. */
export interface ScreenRouterEvents extends EventMap {
  readonly "screen:changed": ScreenChanged;
}

// ===========================================
// Router
// ===========================================

/**
 * Swaps the active screen. The interface lives in `ui/` so screens can
 * navigate through it; `app/` provides the DOM implementation and is the
 * only place screens are registered (architecture §3).
 */
export interface ScreenRouter {
  /** Id of the mounted screen, or undefined before the first navigation. */
  readonly current: ScreenId | undefined;

  /** Unmounts the current screen, mounts `id`, then emits `screen:changed`. A no-op when `id` is already current. */
  navigate(id: ScreenId): void;

  /** Bus the router publishes on; views subscribe here rather than polling `current`. */
  readonly events: EventBus<ScreenRouterEvents>;
}
