import type { Unsubscribe } from "../../core/model/event-bus";
import { SimpleEventBus } from "../../core/service/simple-event-bus";
import type { CityId } from "../../overworld/model/city";
import type { CitySelection } from "../model/city-selection";

// ===========================================
// Events
// ===========================================

/** The one event the selection store emits. */
interface CitySelectionEvents extends Record<string, unknown> {
  readonly changed: CityId | undefined;
}

// ===========================================
// CitySelectionStore
// ===========================================

/**
 * `CitySelection` over a simple event bus. Re-selecting the current city
 * still notifies, so a panel can re-render on a repeated click.
 */
export class CitySelectionStore implements CitySelection {
  // ===========================================
  // Fields
  // ===========================================

  private current: CityId | undefined;
  private readonly bus = new SimpleEventBus<CitySelectionEvents>();

  // ===========================================
  // CitySelection
  // ===========================================

  /** The selected city, or undefined when none is. */
  get cityId(): CityId | undefined {
    return this.current;
  }

  /** Records the selection and notifies every subscriber. */
  select(cityId: CityId | undefined): void {
    this.current = cityId;
    this.bus.emit("changed", cityId);
  }

  /** Subscribes to selection changes; returns the matching unsubscribe. */
  subscribe(listener: (cityId: CityId | undefined) => void): Unsubscribe {
    return this.bus.on("changed", listener);
  }
}
