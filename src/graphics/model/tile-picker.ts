import type { Camera } from "three";

import type { Vec2, Vec3 } from "../../core/model/grid";
import type { TileCoord } from "../../mapgen/model/tile-coord";

/**
 * Hit-tests the tactical map's tiles. The map view implements it and
 * the scene builder forwards to it; the input controller depends on this
 * interface, never on the concrete scene.
 */
export interface TilePicker {
  /** The tile under a normalised device coordinate, or undefined off the map. */
  pickTile(ndc: Vec2, camera: Camera): TileCoord | undefined;

  /** The world centre of a tile's top face, or undefined for a tile not on the map. */
  tileWorldPosition(tile: TileCoord): Vec3 | undefined;
}
