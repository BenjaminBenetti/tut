import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { TacticalState } from "../model/tactical-state";
import type { UnitId } from "../model/unit";
import type { WeaponId } from "../model/unit-weapon";
import { weaponOf } from "../model/unit-weapon";
import type { WeaponReachTuning } from "../model/weapon-reach-tuning";
import { footprintContains, unitFootprintSize } from "./footprint-service";
import { hasLineOfSight } from "./sight-service";
import { closestTiles, withinReach } from "./weapon-reach-service";

// ===========================================
// Weapon range
// ===========================================

/**
 * Every tile `unitId` could hit with `weaponId` from where it stands
 * (#1132): inside the weapon's reach by the rules' own predicate
 * (`withinReach`, height included) **and** with a clear sight line from
 * the tile of the unit's block nearest to it, which is the pair
 * `validateTargeting` measures a shot from. The preview the unit panel
 * paints on hover is built from this, so what is painted red is what
 * the weapon can actually reach, wall by wall and storey by storey.
 *
 * ```
 *   for each column within range + maxReachBonus of the block
 *     for each tile of the column
 *       from = the block's tile nearest it
 *       withinReach(range, from, tile) && hasLineOfSight(from, tile) ──► painted
 * ```
 *
 * The unit's own tiles are never in the answer, and the scan does not
 * stop at fog: unexplored ground is drawn dimmed rather than withheld
 * (GDD §6.2.1), so painting reach over it hides nothing that the map
 * does not already show. Deterministic: tiles come back in scan order.
 *
 * @param mission - The mission the unit is in.
 * @param unitId - The unit whose weapon is previewed.
 * @param weaponId - Which of its weapons; its first when undefined.
 * @param tuning - The reach knobs.
 * @param index - An index over the map, built here when the caller has none.
 * @returns The tiles the weapon can reach, or none for an unknown unit or weapon.
 */
export function weaponRangeTiles(
  mission: TacticalState,
  unitId: UnitId,
  weaponId: WeaponId | undefined,
  tuning: WeaponReachTuning,
  index: TileIndex = new TileIndex(mission.map),
): TileCoord[] {
  const unit = mission.units.find((u) => u.id === unitId);
  if (unit === undefined || unit.hp <= 0) {
    return [];
  }
  const weapon = weaponOf(
    mission.templates[unit.templateId]?.weapons ?? [],
    weaponId,
  );
  if (weapon === undefined || weapon.profile.range <= 0) {
    return [];
  }
  const range = weapon.profile.range;
  const size = unitFootprintSize(mission, unit);
  const radius = range + tuning.maxReachBonus;
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
        const { from } = closestTiles(unit.pos, size, tile, 1);
        if (
          withinReach(range, from, tile, tuning) &&
          hasLineOfSight(mission.map, from, tile, index)
        ) {
          tiles.push({ x: tile.x, y: tile.y, z: tile.z });
        }
      }
    }
  }
  return tiles;
}
