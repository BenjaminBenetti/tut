import type { Unsubscribe } from "../../core/model/event-bus";
import type { ScreenAnchor } from "../view/radial-menu-view";

// ===========================================
// Types
// ===========================================

/** Projects a picked thing to client pixels; undefined when it is not drawn. */
export type PickProjector<TId> = (id: TId) => ScreenAnchor | undefined;

// ===========================================
// PickChannel
// ===========================================

/**
 * In-memory relay between the map's picking controller and a screen
 * for one kind of pickable thing (#1154, #1155): picks are emitted to
 * listeners, and the thing's screen position is answered through a
 * projector attached once the scene exists. Until then nothing has a
 * screen position and no wheel opens.
 *
 * ```
 *   picking.onSelected ──► emit(id) ──► listeners
 *   scene ready ──► useProjector(picking.screenPositionOf)
 * ```
 *
 * `CityPickChannel` and `InstallationPickChannel` wrap one each under
 * the source interfaces the overworld screen depends on.
 */
export class PickChannel<TId> {
  // ===========================================
  // Fields
  // ===========================================

  private projector: PickProjector<TId> | undefined;
  private readonly listeners = new Set<(id: TId) => void>();

  // ===========================================
  // Public Methods
  // ===========================================

  /** Subscribes to picks; returns the matching unsubscribe. */
  onPicked(listener: (id: TId) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Where the thing is, through the attached projector; undefined before one is attached. */
  screenPositionOf(id: TId): ScreenAnchor | undefined {
    return this.projector?.(id);
  }

  /** Attaches (or replaces) the map's projection; `undefined` detaches it. */
  useProjector(projector: PickProjector<TId> | undefined): void {
    this.projector = projector;
  }

  /** Reports a pointer pick to every listener. */
  emit(id: TId): void {
    for (const listener of [...this.listeners]) {
      listener(id);
    }
  }
}
