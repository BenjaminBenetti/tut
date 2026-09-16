import { hashSeed } from "../../core/service/seed-hash";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileIndex } from "../../mapgen/service/tile-index";
import { ROOM_FLOOR_FINISHES } from "../data/interior-floor-styles";
import type { InteriorFloorAppearance } from "../model/interior-floor-style";

/** Resolves finishes once per room without consuming the simulation's random stream. */
export function resolveInteriorFloors(
  map: TacticalMap,
  index: TileIndex,
): ReadonlyMap<number, InteriorFloorAppearance> {
  const result = new Map<number, InteriorFloorAppearance>();
  for (const building of map.buildings) {
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        const finish = ROOM_FLOOR_FINISHES[room.kind ?? "room"];
        if (!finish) continue;
        const variant = (hashSeed(
          `${map.recipe.seed}:${building.id}:${room.id}:floor`,
        ) % 2) as 0 | 1;
        for (let z = room.rect.z; z < room.rect.z + room.rect.d; z++) {
          for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) {
            const tile = index.get(x, floor.y, z);
            if (
              tile?.buildingId === building.id &&
              tile.surface === SurfaceIds.FLOOR
            ) {
              result.set(index.keyOf(tile), { finish, variant });
            }
          }
        }
      }
    }
  }
  return result;
}

/** Shared material identity; the room's geometry and floor level do not duplicate textures. */
export function interiorFloorKey(appearance: InteriorFloorAppearance): string {
  return `${appearance.finish}:${appearance.variant}`;
}
