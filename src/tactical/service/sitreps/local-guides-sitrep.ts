import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import { TileIndex } from "../../../mapgen/service/tile-index";
import type { SitrepRule } from "../../model/sitrep-rule";
import type { TacticalState } from "../../model/tactical-state";

// ===========================================
// Local Guides
// ===========================================

/**
 * Local Guides (campaign arc §11, helps the player): survivors have
 * walked the squad through the district, so the whole map starts
 * explored for the TDF. A setup hook only, and it writes knowledge,
 * not sight (ADR 0006):
 *
 * ```
 *   tdf.explored = every tile key on the map
 *   tdf.visible, tdf.spotted, tdf.lastSeen   untouched: no bug is seen
 *   bugs                                     untouched
 * ```
 *
 * The first look after setup unions what the squad can actually see
 * into this, so `visible` is still only what is in sight. Fog of war
 * keeps hiding units: `perceivedUnits` reads `spotted`, never
 * `explored`. What is drawn from explored ground — the terrain, egg
 * spawners and carcasses — is known from the first frame, which is what
 * a guide would tell you. No draws.
 *
 * @returns The rule for the sitrep table.
 */
export function localGuidesSitrep(): SitrepRule {
  return {
    id: "local-guides",
    setup: (state, map) => guideTheSquad(state, map),
  };
}

/**
 * Marks every tile of the map explored for the TDF. Exported for tests
 * that check the rule apart from the table.
 *
 * @param state - The mission before its first look.
 * @param map - The generated map.
 * @returns The mission with the TDF's explored set covering the map.
 */
export function guideTheSquad(
  state: TacticalState,
  map: TacticalMap,
): TacticalState {
  const index = new TileIndex(map);
  const tdf = state.vision.tdf;
  const explored = map.tiles
    .map((tile) => index.keyOf(tile))
    .sort((a, b) => a - b);
  return {
    ...state,
    vision: { ...state.vision, tdf: { ...tdf, explored } },
  };
}
