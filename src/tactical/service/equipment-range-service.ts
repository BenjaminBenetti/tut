import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { EquipmentCatalogue, EquipmentId } from "../model/equipment";
import type { TacticalState } from "../model/tactical-state";
import type { Unit, UnitId } from "../model/unit";
import { footprintContains, unitFootprintSize } from "./footprint-service";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph } from "./movement-service";
import { validateRadarSite } from "./radar-service";
import { hasLineOfSight } from "./sight-service";
import { attackDistance, closestTiles } from "./weapon-reach-service";

// ===========================================
// Equipment range
// ===========================================

/**
 * Every tile `unitId` could use `equipmentId` on from where it stands
 * (#1134): the preview the unit panel paints when its row is rested on,
 * built from the same predicates the rules refuse a use with, so what
 * is painted is what the item can actually reach.
 *
 * ```
 *   radar  ──► validateRadarSite: a free tile a bounded walk away, on
 *              the unit's level or one off
 *   blast  ──► attackDistance(from, tile) ≤ range and a sight line from
 *   charge     the tile of the unit's block nearest it, the pair
 *              `validateEquipmentUse` measures a throw from
 * ```
 *
 * The unit's own tiles are never in the answer. The radar's walk is a
 * few tiles, so its scan is the item's range box; a thrown item's is
 * the same box, since height only ever adds to `attackDistance` and an
 * item has no reach bonus for standing high. Deterministic: tiles come
 * back in scan order.
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit whose item is previewed.
 * @param equipmentId - Which item; the answer is empty for one the catalogue lacks.
 * @param catalogue - Where item definitions come from.
 * @param index - An index over the map, built here when the caller has none.
 * @param graph - A move graph over the map, built here for a radar when the caller has none.
 * @returns The tiles the item can be used on, or none for an unknown unit or item.
 */
export function equipmentRangeTiles(
  mission: TacticalState,
  unitId: UnitId,
  equipmentId: EquipmentId,
  catalogue: EquipmentCatalogue,
  index: TileIndex = new TileIndex(mission.map),
  graph?: MoveGraph,
): TileCoord[] {
  const unit = mission.units.find((u) => u.id === unitId);
  const definition = catalogue.get(equipmentId);
  if (unit === undefined || unit.hp <= 0 || definition === undefined) {
    return [];
  }
  const size = unitFootprintSize(mission, unit);
  const radius = Math.ceil(definition.range);
  const walk =
    definition.kind === "radar"
      ? (graph ?? buildMoveGraph(mission.map))
      : undefined;
  const tiles: TileCoord[] = [];
  for (let x = unit.pos.x - radius; x <= unit.pos.x + size - 1 + radius; x++) {
    for (
      let z = unit.pos.z - radius;
      z <= unit.pos.z + size - 1 + radius;
      z++
    ) {
      for (const tile of index.column(x, z)) {
        if (footprintContains(unit.pos, size, tile)) {
          continue;
        }
        const allowed =
          walk !== undefined
            ? validateRadarSite(mission, unit, tile, definition.range, walk).ok
            : throwReaches(mission, unit, size, tile, definition.range, index);
        if (allowed) {
          tiles.push({ x: tile.x, y: tile.y, z: tile.z });
        }
      }
    }
  }
  return tiles;
}

// ===========================================
// Helpers
// ===========================================

/**
 * Whether a thrown or placed item reaches `tile` from the unit's block:
 * within `range` by the distance a shot is held against, with a sight
 * line from the block's nearest tile — the two checks
 * `validateEquipmentUse` makes for a blast or a charge.
 */
function throwReaches(
  mission: TacticalState,
  unit: Unit,
  size: number,
  tile: TileCoord,
  range: number,
  index: TileIndex,
): boolean {
  const { from } = closestTiles(unit.pos, size, tile, 1);
  return (
    attackDistance(from, tile) <= range &&
    hasLineOfSight(mission.map, from, tile, index)
  );
}
