import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { CityPickSource } from "../model/city-pick-source";
import type { ScreenAnchor } from "../view/radial-menu-view";

// ===========================================
// Types
// ===========================================

/** Projects a city marker to client pixels; undefined when it is not drawn. */
export type CityProjector = (cityId: CityId) => ScreenAnchor | undefined;

// ===========================================
// CityPickChannel
// ===========================================

/**
 * In-memory `CityPickSource` the app wires between the map's picking
 * controller and the overworld screen (#1154). The screen is composed
 * before the scene exists, so the projector is attached later with
 * `useProjector`; until then no city has a screen position and the
 * wheel simply does not open.
 *
 * ```
 *   picking.onSelected ──► emit(cityId) ──► listeners
 *   scene ready ──► useProjector(picking.screenPositionOf)
 * ```
 */
export class CityPickChannel implements CityPickSource {
  // ===========================================
  // Fields
  // ===========================================

  private projector: CityProjector | undefined;
  private readonly listeners = new Set<(cityId: CityId) => void>();

  // ===========================================
  // CityPickSource
  // ===========================================

  /** Subscribes to picks; returns the matching unsubscribe. */
  onCityPicked(listener: (cityId: CityId) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Where the city's marker is, through the attached projector; undefined before one is attached. */
  cityScreenPosition(cityId: CityId): ScreenAnchor | undefined {
    return this.projector?.(cityId);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Attaches (or replaces) the map's projection; `undefined` detaches it. */
  useProjector(projector: CityProjector | undefined): void {
    this.projector = projector;
  }

  /** Reports a pointer pick to every listener. */
  emit(cityId: CityId): void {
    for (const listener of [...this.listeners]) {
      listener(cityId);
    }
  }
}
