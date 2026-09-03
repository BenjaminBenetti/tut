// ===========================================
// Screen
// ===========================================

/**
 * Every top-level DOM screen the app can show. Later milestones extend
 * this union (mech bay, deployment, mission, results); the router's
 * factory map is keyed by it so a new id without a registered screen is
 * caught at composition time.
 */
export type ScreenId = "main-menu" | "overworld" | "roster";

/** Every screen id, in a fixed order. */
export const SCREEN_IDS: readonly ScreenId[] = [
  "main-menu",
  "overworld",
  "roster",
];

/**
 * A DOM overlay that owns its own markup and listeners for as long as it
 * is mounted. Screens are created fresh by the router on every
 * navigation, so `mount` builds from scratch and `unmount` must leave no
 * DOM or listener behind.
 *
 * ```
 *   router.navigate(id)
 *      │
 *      ├─▶ previous.unmount()        removes DOM + listeners
 *      └─▶ next = factory(); next.mount(root)
 * ```
 */
export interface Screen {
  /** Which screen this is; mirrored to `body[data-screen]` by the router. */
  readonly id: ScreenId;

  /** Builds the screen's DOM under `root` and attaches its listeners. */
  mount(root: HTMLElement): void;

  /** Removes everything `mount` added: DOM and every listener. */
  unmount(): void;
}
