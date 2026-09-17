import type { Unsubscribe } from "../../core/model/event-bus";
import type { CityId } from "../../overworld/model/city";
import type { ScreenAnchor } from "../view/radial-menu-view";

// ===========================================
// CityPickSource
// ===========================================

/**
 * What the overworld screen needs from the strategic map to open the
 * city wheel (#1154, ADR 0007): to hear about a city being picked with
 * the pointer, and to ask where that city's marker is on screen so the
 * ring can sit on it and follow it as the camera moves.
 *
 * ```
 *   map click ──► onCityPicked(cityId) ──► screen opens the wheel
 *   each frame ──► cityScreenPosition(cityId) ──► wheel.moveTo
 * ```
 *
 * A pick is a pointer event, distinct from the selection: a mission
 * chosen in the side panel selects its city without picking it, so no
 * wheel pops up over the map for a click that happened in a list.
 */
export interface CityPickSource {
  /** Subscribes to pointer picks on city markers; returns the matching unsubscribe. */
  onCityPicked(listener: (cityId: CityId) => void): Unsubscribe;

  /** Client-pixel position of a city's marker, or undefined when it is not drawn. */
  cityScreenPosition(cityId: CityId): ScreenAnchor | undefined;
}
