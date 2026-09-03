import type { MapViewportHost } from "../../ui/model/map-viewport-host";

// ===========================================
// DomMapViewportHost
// ===========================================

/**
 * `MapViewportHost` over the real elements: the viewport the bootstrap
 * created and the `#app` container it belongs to between screens.
 * Moving the element keeps the canvas, its WebGL context and every
 * listener attached to it; only the layout changes.
 */
export class DomMapViewportHost implements MapViewportHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly viewport: HTMLElement;
  private readonly home: HTMLElement;

  // ===========================================
  // Constructor
  // ===========================================

  /**
   * @param viewport - The element the map canvas is mounted in.
   * @param home - Where the viewport lives when no screen has borrowed it.
   */
  constructor(viewport: HTMLElement, home: HTMLElement) {
    this.viewport = viewport;
    this.home = home;
  }

  // ===========================================
  // MapViewportHost
  // ===========================================

  /** Appends the viewport to `container`. */
  attach(container: HTMLElement): void {
    container.appendChild(this.viewport);
  }

  /** Appends the viewport back to its home container. */
  release(): void {
    if (this.viewport.parentElement !== this.home) {
      this.home.appendChild(this.viewport);
    }
  }
}
