import type { MapSceneState } from "./map-scene-state";

/**
 * The part of the strategic map scene that follows campaign state. The
 * app's store-to-scene sync depends on this rather than on the scene
 * builder, so the scene can be swapped or stubbed in tests.
 */
export interface MapStateView {
  /**
   * Retints every city for the map, adds the egg cue to the cities in
   * `missionCueCityIds`, and places every installation in its region.
   */
  update(state: MapSceneState): void;
}
