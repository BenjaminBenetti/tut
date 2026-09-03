import type { CityId } from "../../overworld/model/city";
import type { EarthMap } from "../../overworld/model/earth-map";

/**
 * The part of the strategic map scene that follows campaign state. The
 * app's store-to-scene sync depends on this rather than on the scene
 * builder, so the scene can be swapped or stubbed in tests.
 */
export interface MapStateView {
  /** Retints every city for `map` and badges the cities in `missionCityIds`. */
  update(map: EarthMap, missionCityIds: ReadonlySet<CityId>): void;
}
