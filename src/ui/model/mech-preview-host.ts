import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// MechPreviewHost
// ===========================================

/**
 * Lets the mech bay show the mech being built without importing three
 * itself (architecture §3). The app owns the scene, the model loader
 * and the assembly; the screen owns the panel around it and decides
 * when the draft changed.
 *
 * ```
 *   screen.mount   ──► host.attach(container)   builds scene + canvas
 *   draft changes  ──► host.show(loadout)       assembles and redraws
 *   screen.unmount ──► host.release()           disposes the renderer
 * ```
 *
 * The mech bay works without one: the screen treats the host as
 * optional, so the jsdom specs and any headless caller run unchanged.
 */
export interface MechPreviewHost {
  /** Builds the scene inside `container`. Replaces any earlier attachment. */
  attach(container: HTMLElement): void;

  /**
   * Shows `loadout` assembled from its part models.
   *
   * Resolves once the models are loaded and drawn. Calls made while an
   * earlier one is still loading supersede it, so a player dragging
   * through a picker never lands on a stale mech.
   */
  show(loadout: MechLoadout): Promise<void>;

  /** Tears the scene down. Safe to call when not attached. */
  release(): void;
}
