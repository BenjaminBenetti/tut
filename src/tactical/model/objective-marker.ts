import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { ObjectiveId } from "./tactical-state";

// ===========================================
// Objective marker
// ===========================================

/**
 * Where an open objective stands that the player cannot see right now
 * (#1173). Location only, the way a radar contact is: the nest's health
 * and hatch timer stay hidden until the tile itself is in view and the
 * spawner model is drawn. The renderer puts a white diamond blip on
 * the tile so the player always knows where to go.
 */
export interface ObjectiveMarker {
  readonly objectiveId: ObjectiveId;
  readonly pos: TileCoord;
}
