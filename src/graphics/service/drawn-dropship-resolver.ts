import { rectContains } from "../../core/service/grid-math";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { DrawnDropship } from "../model/drawn-dropship";
import { resolveForwardDropships } from "./forward-dropship-resolver";

// ===========================================
// Memo
// ===========================================

/**
 * The ships drawn on each map, worked out once. A map is never changed
 * after it is generated, and the scene, the cutaway's order and the
 * action wheel all ask for the same ships: one derivation, so the hull
 * the player clicks is the hull the scene drew.
 */
const DRAWN = new WeakMap<TacticalMap, readonly DrawnDropship[]>();

// ===========================================
// Resolution
// ===========================================

/**
 * Every drop ship the scene draws, whichever way it is drawn (a model
 * or a placeholder box):
 *
 * ```
 *   map.dropships (landing zones) ──┐
 *                                   ├──► DrawnDropship[]
 *   forward extraction points ──────┘    (landing first, then forward)
 * ```
 *
 * A landing zone's ship is the generator's complete envelope, on the
 * ground, sharing its boarding zone's first tile's vision; a site whose
 * boarding zone is missing is skipped rather than guessed. A forward
 * point's ship is fitted by `resolveForwardDropships` (#1179).
 *
 * Worked out once per map (`DRAWN`); later calls return the same list.
 *
 * @param map - The map to draw.
 * @param index - The map's tile index, when the caller has one; read
 *   only the first time the map is asked for.
 */
export function resolveDrawnDropships(
  map: TacticalMap,
  index?: TileIndex,
): readonly DrawnDropship[] {
  const known = DRAWN.get(map);
  if (known !== undefined) return known;
  const landing = (map.dropships ?? []).flatMap((site) => {
    const boarding = map.hooks.deployZones.find(
      (zone) => zone.id === site.deployZoneId,
    )?.tiles[0];
    if (boarding === undefined) return [];
    return [
      {
        footprint: site.footprint,
        level: site.level,
        lift: 0,
        facing: site.facing,
        tile: boarding,
      },
    ];
  });
  const drawn = [
    ...landing,
    ...resolveForwardDropships(map, index ?? new TileIndex(map)),
  ];
  DRAWN.set(map, drawn);
  return drawn;
}

/**
 * Whether a drawn drop ship's hull stands over the column: the tiles
 * under the aircraft, lowered ramp included, at any height (#1179).
 *
 * @param map - The map the ships are drawn on.
 * @param column - The column's x and z.
 * @param column.x - Its x.
 * @param column.z - Its z.
 * @returns True when a drawn ship's footprint covers the column.
 */
export function isUnderDrawnDropship(
  map: TacticalMap,
  column: { readonly x: number; readonly z: number },
): boolean {
  return resolveDrawnDropships(map).some((ship) =>
    rectContains(ship.footprint, column.x, column.z),
  );
}
