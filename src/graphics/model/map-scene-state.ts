import type { CityId } from "../../overworld/model/city";
import type { Deployable } from "../../overworld/model/deployable";
import type { EarthMap } from "../../overworld/model/earth-map";

/**
 * What the strategic map scene draws from the campaign (#1155): the
 * map with each city's infestation, which cities carry the egg cue, and
 * every built installation. Assembled by the app's store-to-scene sync
 * from `OverworldState`; plain data, so the scene reads it and holds no
 * game truth (architecture §2.3).
 *
 * ```
 *   OverworldState ──▶ MapSceneState ──▶ OverworldSceneBuilder.update
 *     map                map                 markers retinted
 *     missions[]         missionCueCityIds   egg overlays added / removed
 *     deployables[]      deployables         installations placed / dimmed
 * ```
 */
export interface MapSceneState {
  /** The strategic map with each city's current infestation. */
  readonly map: EarthMap;
  /** Cities with an infestation-clearance mission on offer; they wear the egg overlay. */
  readonly missionCueCityIds: ReadonlySet<CityId>;
  /** Every built installation, online or not; each is drawn in its region. */
  readonly deployables: readonly Deployable[];
}
