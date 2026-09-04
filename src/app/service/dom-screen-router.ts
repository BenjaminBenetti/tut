import type { EventBus } from "../../core/model/event-bus";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { Screen, ScreenId } from "../../ui/model/screen";
import type {
  ScreenRouter,
  ScreenRouterEvents,
} from "../../ui/model/screen-router";

// ===========================================
// Types
// ===========================================

/** Builds a fresh screen instance each time the router navigates to it. */
export type ScreenFactory = () => Screen;

// ===========================================
// DomScreenRouter
// ===========================================

/**
 * `ScreenRouter` over a DOM root and a factory map. Exactly one screen is
 * mounted under the root at a time; the current id is mirrored to
 * `body[data-screen]` on the root's document so end-to-end tests can wait
 * on it without reaching into app internals.
 *
 * ```
 *   navigate("overworld")
 *     │  current: main-menu
 *     ├─▶ mainMenu.unmount()
 *     ├─▶ overworld = factories.get("overworld")()
 *     ├─▶ overworld.mount(root)
 *     ├─▶ body.dataset.screen = "overworld"
 *     └─▶ events.emit("screen:changed", { from: "main-menu", to: "overworld" })
 * ```
 */
export class DomScreenRouter implements ScreenRouter {
  // ===========================================
  // Fields
  // ===========================================

  readonly events: EventBus<ScreenRouterEvents>;
  private readonly root: HTMLElement;
  private readonly factories: ReadonlyMap<ScreenId, ScreenFactory>;
  private active: Screen | undefined;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param root - Element screens mount under; normally the `#ui` overlay.
   * @param factories - One factory per screen id the app can show.
   * @param events - Bus to publish on; a private bus by default.
   */
  constructor(
    root: HTMLElement,
    factories: ReadonlyMap<ScreenId, ScreenFactory>,
    events: EventBus<ScreenRouterEvents> = new SimpleEventBus<ScreenRouterEvents>(),
  ) {
    this.root = root;
    this.factories = factories;
    this.events = events;
  }

  // ===========================================
  // ScreenRouter
  // ===========================================

  /** Id of the mounted screen, or undefined before the first navigation. */
  get current(): ScreenId | undefined {
    return this.active?.id;
  }

  /**
   * Swaps screens. Re-navigating to the current id does nothing, so a
   * double click on a menu button cannot rebuild the screen. An id with
   * no factory is a composition bug and throws.
   *
   * A screen may navigate away from inside its own `mount` — the
   * tactical screen hands a mission that is already over straight to the
   * debrief (#341) — so the later navigation wins: once another screen
   * has recorded itself as active, this one stops rather than stamping
   * its own id over the screen that is really mounted.
   */
  navigate(id: ScreenId): void {
    if (this.active?.id === id) {
      return;
    }
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`No screen registered for id "${id}"`);
    }

    const from = this.active?.id;
    this.active?.unmount();

    const next = factory();
    this.active = next;
    next.mount(this.root);
    if (this.active !== next) {
      return;
    }
    this.root.ownerDocument.body.dataset.screen = id;

    this.events.emit("screen:changed", { from, to: id });
  }
}
