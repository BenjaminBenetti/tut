import {
  MAP_READY_ATTRIBUTE,
  type MapViewportHost,
  type SettleableScene,
} from "../../ui/model/map-viewport-host";

// ===========================================
// DomMapViewportHost
// ===========================================

/**
 * `MapViewportHost` over the real elements: the viewport the bootstrap
 * created and the `#app` container it belongs to between screens.
 * Moving the element keeps the canvas, its WebGL context and every
 * listener attached to it; only the layout changes.
 *
 * It also owns `body[data-map-ready]` (#473), because moving the element
 * is exactly the moment the map stops being worth measuring and the
 * scene settling is exactly the moment it starts again.
 */
export class DomMapViewportHost implements MapViewportHost {
  // ===========================================
  // Fields
  // ===========================================

  private readonly viewport: HTMLElement;
  private readonly home: HTMLElement;
  private scene: SettleableScene | undefined;
  private cancelWait: (() => void) | undefined;

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
  // Wiring
  // ===========================================

  /**
   * Gives the host the scene to watch. Set rather than injected because
   * the bootstrap builds the host first — screens are registered before
   * the renderer exists — and a host with no scene simply never reports
   * the map ready, which is the safe way round.
   *
   * @param scene - The scene drawing into this viewport.
   */
  useScene(scene: SettleableScene): void {
    this.scene = scene;
  }

  // ===========================================
  // MapViewportHost
  // ===========================================

  /**
   * Appends the viewport to `container` and marks the map unmeasurable
   * until the scene has drawn a frame at the new size.
   */
  attach(container: HTMLElement): void {
    this.clearReady();
    container.appendChild(this.viewport);
    // Subscribed after the move, so the scene compares against the
    // container the viewport is now in rather than the one it left.
    this.cancelWait = this.scene?.onSettled(() => {
      this.cancelWait = undefined;
      this.viewport.ownerDocument.body.setAttribute(
        MAP_READY_ATTRIBUTE,
        "true",
      );
    });
  }

  /** Appends the viewport back to its home container. */
  release(): void {
    this.clearReady();
    if (this.viewport.parentElement !== this.home) {
      this.home.appendChild(this.viewport);
    }
  }

  // ===========================================
  // Private Methods
  // ===========================================

  /**
   * Drops the ready flag and any wait still outstanding, so a screen
   * that unmounts mid-settle cannot raise it over a dead layout.
   */
  private clearReady(): void {
    this.cancelWait?.();
    this.cancelWait = undefined;
    this.viewport.ownerDocument.body.removeAttribute(MAP_READY_ATTRIBUTE);
  }
}
