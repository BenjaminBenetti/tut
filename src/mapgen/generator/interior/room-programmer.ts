import type { Rng } from "../../../core/model/rng";
import { rectContains } from "../../../core/service/grid-math";
import { RoomKindIds } from "../../data/room-kind-ids";
import type { Room } from "../../model/building";
import type { BuildingRoomProgram } from "../../model/building-room-program";
import type { TileCoord } from "../../model/tile-coord";

/**
 * Gives geometric rooms a purpose: public rooms at the arrival side,
 * service rooms in the smallest spaces, then the building's private uses.
 * Corridors retain their identity, including when the front door opens
 * into one, so furnishing never mistakes a circulation spine for a room.
 */
export function assignRoomPurposes(
  rooms: readonly Room[],
  program: BuildingRoomProgram | undefined,
  entrance: TileCoord,
  groundFloor: boolean,
  rng: Rng,
): Room[] {
  const privateRooms = rooms.filter(
    (room) => room.kind !== RoomKindIds.CORRIDOR,
  );
  const ordered = rng
    .shuffle(privateRooms)
    .sort(
      (a, b) =>
        (a.layoutRole === "arrival" ? -1 : 0) -
          (b.layoutRole === "arrival" ? -1 : 0) ||
        distanceToRoom(a, entrance) - distanceToRoom(b, entrance),
    );
  const kinds = new Map<string, string>();
  const arrival = ordered.shift();
  if (arrival !== undefined) {
    kinds.set(
      arrival.id,
      program?.arrival ?? (groundFloor ? RoomKindIds.HALL : RoomKindIds.ROOM),
    );
  }
  const primary = [...(program?.primary ?? [])];
  for (const room of [...ordered]) {
    const use =
      room.layoutSlot === undefined
        ? undefined
        : program?.roomSlots?.[room.layoutSlot];
    if (use === undefined) continue;
    kinds.set(room.id, use);
    ordered.splice(ordered.indexOf(room), 1);
    const supplied = primary.indexOf(use);
    if (supplied !== -1) primary.splice(supplied, 1);
  }
  if (
    program?.compact !== undefined &&
    privateRooms.length >= program.compact.minRooms
  ) {
    const compact = [...ordered].sort(
      (a, b) =>
        a.rect.w * a.rect.d - b.rect.w * b.rect.d ||
        distanceToRoom(b, entrance) - distanceToRoom(a, entrance),
    )[0];
    if (compact !== undefined) {
      kinds.set(compact.id, program.compact.kind);
      ordered.splice(ordered.indexOf(compact), 1);
    }
  }
  const repeat = rng.shuffle(program?.repeat ?? [RoomKindIds.ROOM]);
  ordered.sort(
    (a, b) =>
      (a.layoutRole === "main" ? -1 : 0) - (b.layoutRole === "main" ? -1 : 0),
  );
  ordered.forEach((room, index) => {
    kinds.set(
      room.id,
      primary[index] ?? repeat[index % repeat.length] ?? RoomKindIds.ROOM,
    );
  });
  return rooms.map((room) => ({
    ...room,
    kind:
      room.kind === RoomKindIds.CORRIDOR
        ? RoomKindIds.CORRIDOR
        : (kinds.get(room.id) ?? RoomKindIds.ROOM),
  }));
}

/** Manhattan distance to the nearest room tile, with the entrance room first. */
function distanceToRoom(room: Room, entrance: TileCoord): number {
  if (rectContains(room.rect, entrance.x, entrance.z)) return -1;
  const { x, z, w, d } = room.rect;
  return (
    Math.max(x - entrance.x, 0, entrance.x - (x + w - 1)) +
    Math.max(z - entrance.z, 0, entrance.z - (z + d - 1))
  );
}
