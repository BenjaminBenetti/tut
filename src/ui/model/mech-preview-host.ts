import type { SinglePartSlot } from "../../roster/model/mech-loadout";
import type { MechLoadout } from "../../roster/model/mech-loadout";

// ===========================================
// Types
// ===========================================

/**
 * Where a fitted part sits on the preview's screen (#1145): the centre
 * of its silhouette in CSS pixels from the container's top-left. The
 * mech bay hangs a slot badge there, so the name of the legs sits on
 * the legs rather than in a column beside the picture (ADR 0007).
 */
export interface SlotAnchor {
  readonly slot: SinglePartSlot;
  readonly x: number;
  readonly y: number;
}

/** What a preview host tells the screen about the picture it drew. */
export interface MechPreviewListener {
  /**
   * The host drew a frame: here is where every part with a model landed.
   * Called after each draw, so a resize or a swap moves the badges too.
   */
  framed(anchors: readonly SlotAnchor[]): void;
}

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
 *   screen.mount   ──► host.attach(container, listener)   builds scene + canvas
 *   draft changes  ──► host.show(loadout)                 assembles and redraws
 *   every draw     ──► listener.framed(anchors)           badges follow the parts
 *   screen.unmount ──► host.release()                     disposes the renderer
 * ```
 *
 * The mech bay works without one: the screen treats the host as
 * optional, so the jsdom specs and any headless caller run unchanged.
 */
export interface MechPreviewHost {
  /**
   * Builds the scene inside `container`. Replaces any earlier attachment.
   *
   * @param container - The element the canvas goes in.
   * @param listener - Told where the parts landed after every draw.
   */
  attach(container: HTMLElement, listener?: MechPreviewListener): void;

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
