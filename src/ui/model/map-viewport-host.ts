// ===========================================
// MapViewportHost
// ===========================================

/**
 * Lets a screen borrow the app's map viewport (the element the three.js
 * canvas lives in, created once at boot) for the time it is mounted.
 * The scene sizes itself to whatever container the viewport sits in, so
 * the overworld can lay the map out beside its panels instead of under
 * them, and give it back to its full-window home on unmount.
 *
 * ```
 *   boot:          #app ▸ #map-viewport ▸ canvas     (menu background)
 *   attach(cell):  #ui ▸ .tut-overworld ▸ #map-area ▸ #map-viewport
 *   release():     #app ▸ #map-viewport               (again)
 * ```
 *
 * Moving the element does not resize the scene in the same turn, so an
 * implementation also reports when the map is worth measuring — see
 * `MAP_READY_ATTRIBUTE` (#473).
 */
export interface MapViewportHost {
  /** Moves the viewport into `container`; the scene resizes to fit it. */
  attach(container: HTMLElement): void;

  /** Returns the viewport to its home container. Safe to call when not attached. */
  release(): void;
}

/**
 * The body attribute that reads `"true"` once the map has been rendered
 * at the size of the container it is currently in, and is absent at
 * every other moment (#473).
 *
 * `body[data-screen="overworld"]` flips the instant the screen mounts,
 * which is one or more frames before the camera has been rebuilt for the
 * map cell. A test that waits on the screen and then projects a world
 * position reads the previous frustum and gets a plausible wrong answer
 * — 78 px out on seed 4242, which #451 reported as sixteen cities in the
 * ocean. Wait on this instead.
 */
export const MAP_READY_ATTRIBUTE = "data-map-ready";

/**
 * The scene the host watches: just enough of `SceneService` to know when
 * the viewport is worth measuring, so the host does not depend on the
 * renderer, the camera or the loop.
 */
export interface SettleableScene {
  /**
   * Runs `listener` once the scene has drawn a frame at its container's
   * current size, immediately if that is already true.
   *
   * @param listener - Called once.
   * @returns Unsubscribes a listener that is no longer wanted.
   */
  onSettled(listener: () => void): () => void;
}
