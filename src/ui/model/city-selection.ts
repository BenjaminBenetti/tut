import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";

// ===========================================
// City selection
// ===========================================

/**
 * Which city the player has picked on the map, shared between the
 * graphics picking controller (writer) and the overworld panels
 * (readers). Presentation-only state: it is not part of the campaign and
 * is never saved.
 *
 * ```
 *   picking ──select(cityId)──► CitySelection ──subscribe──► city panel, deployables
 * ```
 */
export interface CitySelection {
  /** The selected city, or undefined when none is. */
  readonly cityId: CityId | undefined;

  /** Selects a city (or clears with undefined) and notifies subscribers. */
  select(cityId: CityId | undefined): void;

  /** Subscribes to selection changes; returns the matching unsubscribe. */
  subscribe(listener: (cityId: CityId | undefined) => void): Unsubscribe;
}
