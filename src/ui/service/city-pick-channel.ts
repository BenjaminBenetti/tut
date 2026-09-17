import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { CityPickSource } from "../model/city-pick-source";
import type { ScreenAnchor } from "../view/radial-menu-view";
import type { PickProjector } from "./pick-channel";
import { PickChannel } from "./pick-channel";

// ===========================================
// Types
// ===========================================

/** Projects a city marker to client pixels; undefined when it is not drawn. */
export type CityProjector = PickProjector<CityId>;

// ===========================================
// CityPickChannel
// ===========================================

/**
 * The `CityPickSource` the app wires between the map's picking
 * controller and the overworld screen (#1154): a `PickChannel` over
 * city ids under the source's names.
 */
export class CityPickChannel implements CityPickSource {
  // ===========================================
  // Fields
  // ===========================================

  private readonly channel = new PickChannel<CityId>();

  // ===========================================
  // CityPickSource
  // ===========================================

  /** Subscribes to picks; returns the matching unsubscribe. */
  onCityPicked(listener: (cityId: CityId) => void): Unsubscribe {
    return this.channel.onPicked(listener);
  }

  /** Where the city's marker is, through the attached projector; undefined before one is attached. */
  cityScreenPosition(cityId: CityId): ScreenAnchor | undefined {
    return this.channel.screenPositionOf(cityId);
  }

  // ===========================================
  // Public Methods
  // ===========================================

  /** Attaches (or replaces) the map's projection; `undefined` detaches it. */
  useProjector(projector: CityProjector | undefined): void {
    this.channel.useProjector(projector);
  }

  /** Reports a pointer pick to every listener. */
  emit(cityId: CityId): void {
    this.channel.emit(cityId);
  }
}
