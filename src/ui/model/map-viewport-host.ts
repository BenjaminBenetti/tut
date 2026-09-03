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
 */
export interface MapViewportHost {
  /** Moves the viewport into `container`; the scene resizes to fit it. */
  attach(container: HTMLElement): void;

  /** Returns the viewport to its home container. Safe to call when not attached. */
  release(): void;
}
