import type { Rect } from "../../../core/model/grid";
import type { Rng } from "../../../core/model/rng";
import type { Room } from "../../model/building";
import type { MapDraft } from "../../model/map-draft";

// ===========================================
// Constants
// ===========================================

/** Chance to keep a room whole when it could still be split once more. */
const STOP_CHANCE = 0.35;

// ===========================================
// Room partitioning
// ===========================================

/**
 * Splits one floor's footprint into rooms by recursive bisection along
 * the longer axis, never below `minRoomSize` per side. Every split puts a
 * solid wall on the cut with one door in it, so by induction every room
 * on the floor is reachable from every other. Tiles get their `roomId`.
 *
 * ```
 *   +-------+-------+
 *   |  r1   d  r2   |     d = door in the cut wall
 *   +---d---+       |
 *   |  r3   |       |
 *   +-------+-------+
 * ```
 */
export function partitionFloor(
  draft: MapDraft,
  buildingId: string,
  floorIndex: number,
  y: number,
  footprint: Rect,
  minRoomSize: number,
  rng: Rng,
): Room[] {
  const rooms: Room[] = [];
  split(footprint);
  return rooms;

  /** Recursively bisects `rect`, recording rooms and cutting walls. */
  function split(rect: Rect): void {
    const canSplitX = rect.w >= 2 * minRoomSize;
    const canSplitZ = rect.d >= 2 * minRoomSize;
    const small =
      rect.w <= 2 * minRoomSize + 1 && rect.d <= 2 * minRoomSize + 1;
    if ((!canSplitX && !canSplitZ) || (small && rng.chance(STOP_CHANCE))) {
      rooms.push(makeRoom(rect));
      return;
    }
    if (canSplitX && (!canSplitZ || rect.w >= rect.d)) {
      const cut = rng.nextInt(
        rect.x + minRoomSize,
        rect.x + rect.w - minRoomSize,
      );
      const doorZ = rng.nextInt(rect.z, rect.z + rect.d - 1);
      for (let z = rect.z; z < rect.z + rect.d; z++) {
        draft.setWall(
          { x: cut - 1, y, z },
          "e",
          z === doorZ ? "door" : "solid",
        );
      }
      split({ x: rect.x, z: rect.z, w: cut - rect.x, d: rect.d });
      split({ x: cut, z: rect.z, w: rect.x + rect.w - cut, d: rect.d });
    } else {
      const cut = rng.nextInt(
        rect.z + minRoomSize,
        rect.z + rect.d - minRoomSize,
      );
      const doorX = rng.nextInt(rect.x, rect.x + rect.w - 1);
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        draft.setWall(
          { x, y, z: cut - 1 },
          "s",
          x === doorX ? "door" : "solid",
        );
      }
      split({ x: rect.x, z: rect.z, w: rect.w, d: cut - rect.z });
      split({ x: rect.x, z: cut, w: rect.w, d: rect.z + rect.d - cut });
    }
  }

  /** Records a room and stamps its id on the floor tiles. */
  function makeRoom(rect: Rect): Room {
    const id = draft.ids.nextId("room");
    for (let z = rect.z; z < rect.z + rect.d; z++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const tile = draft.getTile({ x, y, z });
        if (tile?.buildingId === buildingId) {
          tile.roomId = id;
        }
      }
    }
    return { id, floorIndex, rect };
  }
}
